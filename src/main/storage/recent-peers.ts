import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import type { Device } from '../../shared/types';

const MAX_RECENT_PEERS = 24;

interface StoredPeer extends Device {
  updatedAt: number;
}

export class RecentPeerStore {
  private readonly configPath: string;
  private readonly peers = new Map<string, StoredPeer>();

  constructor(userDataDir: string) {
    this.configPath = join(userDataDir, 'recent-peers.json');
    for (const peer of this.load()) {
      this.peers.set(peer.deviceId, peer);
    }
  }

  list(): Device[] {
    return [...this.peers.values()]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map(({ updatedAt: _updatedAt, ...device }) => device);
  }

  upsert(device: Device): void {
    this.peers.set(device.deviceId, {
      ...device,
      updatedAt: Date.now()
    });
    this.trim();
    this.persist();
  }

  private trim(): void {
    const sorted = [...this.peers.values()].sort((left, right) => right.updatedAt - left.updatedAt);
    for (const peer of sorted.slice(MAX_RECENT_PEERS)) {
      this.peers.delete(peer.deviceId);
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.configPath), { recursive: true });
    writeFileSync(
      this.configPath,
      JSON.stringify(
        [...this.peers.values()].sort((left, right) => right.updatedAt - left.updatedAt),
        null,
        2
      ),
      'utf8'
    );
  }

  private load(): StoredPeer[] {
    if (!existsSync(this.configPath)) {
      return [];
    }

    try {
      const raw = readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as StoredPeer[];
      return Array.isArray(parsed) ? parsed.filter(isStoredPeer) : [];
    } catch {
      return [];
    }
  }
}

function isStoredPeer(value: unknown): value is StoredPeer {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<StoredPeer>;
  return (
    typeof candidate.deviceId === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.trustFingerprint === 'string' &&
    typeof candidate.trustPublicKey === 'string' &&
    typeof candidate.host === 'string' &&
    typeof candidate.address === 'string' &&
    typeof candidate.port === 'number' &&
    typeof candidate.platform === 'string' &&
    typeof candidate.version === 'string' &&
    typeof candidate.updatedAt === 'number'
  );
}
