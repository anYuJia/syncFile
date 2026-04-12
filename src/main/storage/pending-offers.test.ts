import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { PendingOfferStore } from './pending-offers';

describe('PendingOfferStore', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'syncfile-pending-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('persists pending offers', () => {
    const store = new PendingOfferStore(root);
    store.upsert({
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

    const reloaded = new PendingOfferStore(root);
    expect(reloaded.list()).toHaveLength(1);
    expect(reloaded.list()[0].offerId).toBe('offer-1');
  });
});
