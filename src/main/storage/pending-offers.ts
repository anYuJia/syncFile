import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import type { IncomingOffer } from '../../shared/types';

export class PendingOfferStore {
  private readonly configPath: string;
  private readonly offers = new Map<string, IncomingOffer>();

  constructor(userDataDir: string) {
    this.configPath = join(userDataDir, 'pending-offers.json');
    for (const offer of this.load()) {
      this.offers.set(offer.offerId, offer);
    }
  }

  list(): IncomingOffer[] {
    return [...this.offers.values()].sort((a, b) => b.receivedAt - a.receivedAt);
  }

  upsert(offer: IncomingOffer): void {
    this.offers.set(offer.offerId, offer);
    this.persist();
  }

  remove(offerId: string): void {
    if (this.offers.delete(offerId)) {
      this.persist();
    }
  }

  clear(): void {
    this.offers.clear();
    this.persist();
  }

  private persist(): void {
    mkdirSync(dirname(this.configPath), { recursive: true });
    writeFileSync(this.configPath, JSON.stringify(this.list(), null, 2), 'utf8');
  }

  private load(): IncomingOffer[] {
    if (!existsSync(this.configPath)) {
      return [];
    }

    try {
      const raw = readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as IncomingOffer[];
      return Array.isArray(parsed) ? parsed.filter(isIncomingOffer) : [];
    } catch {
      return [];
    }
  }
}

function isIncomingOffer(value: unknown): value is IncomingOffer {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<IncomingOffer>;
  return (
    typeof candidate.offerId === 'string' &&
    typeof candidate.fileName === 'string' &&
    typeof candidate.fileSize === 'number' &&
    typeof candidate.receivedAt === 'number' &&
    typeof candidate.saveDirectory === 'string' &&
    typeof candidate.fromDevice?.deviceId === 'string' &&
    typeof candidate.fromDevice?.name === 'string' &&
    typeof candidate.fromDevice?.trustFingerprint === 'string' &&
    typeof candidate.fromDevice?.trustPublicKey === 'string'
  );
}
