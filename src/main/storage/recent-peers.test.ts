import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RecentPeerStore } from './recent-peers';

describe('RecentPeerStore', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'syncfile-recent-peers-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('persists and reloads remembered peers', () => {
    const store = new RecentPeerStore(root);
    store.upsert({
      deviceId: 'peer-1',
      name: 'Peer',
      trustFingerprint: 'AAAA-BBBB-CCCC-DDDD',
      trustPublicKey: 'PUBKEY1',
      host: 'peer.local',
      address: '10.0.0.8',
      port: 43434,
      platform: 'win32',
      version: '1'
    });

    const reloaded = new RecentPeerStore(root);
    const peers = reloaded.list();

    expect(peers).toHaveLength(1);
    expect(peers[0].deviceId).toBe('peer-1');
    expect(peers[0].address).toBe('10.0.0.8');
  });
});
