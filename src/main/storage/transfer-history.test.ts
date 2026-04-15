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

  it('persists and reloads transfer records', async () => {
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
    await store.flush();

    const reloaded = new TransferHistoryStore(root);
    const records = reloaded.list();

    expect(records).toHaveLength(1);
    expect(records[0].transferId).toBe('t1');
    expect(records[0].status).toBe('completed');
    expect(records[0].localPath).toBe('/tmp/demo.txt');
  });

  it('clears stored transfer records', async () => {
    const store = new TransferHistoryStore(root);
    store.upsert({
      transferId: 't1',
      direction: 'send',
      fileName: 'demo.txt',
      fileSize: 100,
      bytesTransferred: 100,
      peerDeviceName: 'Peer',
      status: 'completed'
    });

    store.clear();
    await store.flush();

    expect(store.list()).toEqual([]);
    expect(store.count()).toBe(0);
  });

  it('marks unfinished send records as recoverable failures', async () => {
    const store = new TransferHistoryStore(root);
    store.upsert({
      transferId: 't2',
      direction: 'send',
      fileName: 'demo.txt',
      fileSize: 100,
      bytesTransferred: 40,
      peerDeviceName: 'Peer',
      status: 'in-progress'
    });

    store.markInterruptedSends();
    await store.flush();

    const [record] = store.list();
    expect(record.status).toBe('failed');
    expect(record.error).toContain('Retry to continue');
  });

  it('clears only finished records when requested', async () => {
    const store = new TransferHistoryStore(root);
    store.upsert({
      transferId: 'active-1',
      direction: 'send',
      fileName: 'active.txt',
      fileSize: 100,
      bytesTransferred: 20,
      peerDeviceName: 'Peer',
      status: 'in-progress'
    });
    store.upsert({
      transferId: 'done-1',
      direction: 'send',
      fileName: 'done.txt',
      fileSize: 100,
      bytesTransferred: 100,
      peerDeviceName: 'Peer',
      status: 'completed'
    });

    const remaining = store.clearFinished();
    await store.flush();

    expect(remaining).toHaveLength(1);
    expect(remaining[0].transferId).toBe('active-1');
  });

  it('clears paused records when dismissible history is requested', async () => {
    const store = new TransferHistoryStore(root);
    store.upsert({
      transferId: 'paused-1',
      direction: 'receive',
      fileName: 'paused.txt',
      fileSize: 100,
      bytesTransferred: 30,
      peerDeviceName: 'Peer',
      status: 'paused'
    });
    store.upsert({
      transferId: 'active-1',
      direction: 'send',
      fileName: 'active.txt',
      fileSize: 100,
      bytesTransferred: 20,
      peerDeviceName: 'Peer',
      status: 'in-progress'
    });

    const remaining = store.clearDismissible();
    await store.flush();

    expect(remaining).toHaveLength(1);
    expect(remaining[0].transferId).toBe('active-1');
  });

  it('removes only the requested transfer ids', async () => {
    const store = new TransferHistoryStore(root);
    store.upsert({
      transferId: 'send-1',
      direction: 'send',
      fileName: 'send.txt',
      fileSize: 100,
      bytesTransferred: 100,
      peerDeviceName: 'Peer',
      status: 'completed'
    });
    store.upsert({
      transferId: 'recv-1',
      direction: 'receive',
      fileName: 'recv.txt',
      fileSize: 80,
      bytesTransferred: 80,
      peerDeviceName: 'Peer',
      status: 'completed'
    });

    const remaining = store.removeMany(['send-1']);
    await store.flush();

    expect(remaining).toHaveLength(1);
    expect(remaining[0].transferId).toBe('recv-1');
  });
});
