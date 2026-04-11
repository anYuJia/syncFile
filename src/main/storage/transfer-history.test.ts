import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { TransferHistoryStore } from './transfer-history';

describe('TransferHistoryStore', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'syncfile-history-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('persists and reloads transfer records', () => {
    const store = new TransferHistoryStore(root);
    store.upsert({
      transferId: 't1',
      direction: 'send',
      fileName: 'demo.txt',
      fileSize: 100,
      bytesTransferred: 100,
      peerDeviceName: 'Peer',
      status: 'completed',
      localPath: '/tmp/demo.txt'
    });

    const reloaded = new TransferHistoryStore(root);
    const records = reloaded.list();

    expect(records).toHaveLength(1);
    expect(records[0].transferId).toBe('t1');
    expect(records[0].status).toBe('completed');
    expect(records[0].localPath).toBe('/tmp/demo.txt');
  });
});
