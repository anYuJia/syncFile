import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { PendingOfferStore } from './pending-offers';
import { recoverPendingOffers } from './pending-offer-recovery';
import { TransferHistoryStore } from './transfer-history';

describe('recoverPendingOffers', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'syncfile-pending-recovery-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('moves pending offers into failed transfer history entries', () => {
    const pending = new PendingOfferStore(root);
    const history = new TransferHistoryStore(root);

    pending.upsert({
      offerId: 'offer-1',
      fromDevice: {
        deviceId: 'dev-1',
        name: 'Alice MacBook',
        trustFingerprint: 'AAAA-BBBB-CCCC-DDDD',
        trustPublicKey: 'PUBKEY1'
      },
      fileName: 'demo.txt',
      fileSize: 10,
      receivedAt: 1,
      saveDirectory: '/tmp/incoming'
    });

    recoverPendingOffers(pending, history);

    expect(pending.list()).toEqual([]);
    const [record] = history.list();
    expect(record.transferId).toBe('offer-1');
    expect(record.direction).toBe('receive');
    expect(record.status).toBe('failed');
  });
});
