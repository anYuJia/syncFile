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

  it('clears stored transfer records', () => {
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

    expect(store.list()).toEqual([]);
    expect(store.count()).toBe(0);
  });

  it('marks unfinished send records as recoverable failures', () => {
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

    const [record] = store.list();
    expect(record.status).toBe('failed');
    expect(record.error).toContain('Retry to continue');
  });

  it('clears only finished records when requested', () => {
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

    expect(remaining).toHaveLength(1);
    expect(remaining[0].transferId).toBe('active-1');
  });
});
