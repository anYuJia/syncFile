import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { Sandbox } from './sandbox';
import { TransferHistoryStore } from './transfer-history';
import { recoverTransferState } from './transfer-recovery';

describe('recoverTransferState', () => {
  let root: string;
  let sandbox: Sandbox;
  let history: TransferHistoryStore;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'syncfile-recovery-'));
    sandbox = new Sandbox(join(root, 'sandbox'));
    history = new TransferHistoryStore(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('marks unfinished sends failed and imports resumable receives', () => {
    history.upsert({
      transferId: 'send-1',
      direction: 'send',
      fileName: 'photo.jpg',
      fileSize: 100,
      bytesTransferred: 40,
      peerDeviceName: 'Peer',
      peerDeviceId: 'peer-1',
      status: 'in-progress',
      localPath: '/tmp/photo.jpg'
    });

    const prepared = sandbox.prepareIncomingResume('recv-1', 'peer-2', 'Alice MacBook', 'notes.txt', 10);
    writeFileSync(prepared.partialPath, 'hello');

    recoverTransferState(history, sandbox);

    const records = history.list();
    const send = records.find((record) => record.transferId === 'send-1');
    const receive = records.find((record) => record.transferId === 'recv-1');

    expect(send?.status).toBe('failed');
    expect(send?.error).toContain('Retry to continue');
    expect(receive?.direction).toBe('receive');
    expect(receive?.bytesTransferred).toBe(5);
    expect(receive?.localPath).toBe(prepared.partialPath);
  });
});
