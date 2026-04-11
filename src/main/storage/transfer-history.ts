import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import type { TransferRecord, TransferProgress } from '../../shared/types';

const MAX_HISTORY = 200;

export class TransferHistoryStore {
  private readonly configPath: string;
  private readonly records = new Map<string, TransferRecord>();

  constructor(userDataDir: string) {
    this.configPath = join(userDataDir, 'transfer-history.json');
    for (const record of this.load()) {
      this.records.set(record.transferId, record);
    }
  }

  list(): TransferRecord[] {
    return [...this.records.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  count(): number {
    return this.records.size;
  }

  upsert(progress: TransferProgress): TransferRecord {
    const previous = this.records.get(progress.transferId);
    const record: TransferRecord = {
      ...previous,
      ...progress,
      updatedAt: Date.now()
    };
    this.records.set(record.transferId, record);
    this.trim();
    this.persist();
    return record;
  }

  clear(): void {
    this.records.clear();
    this.persist();
  }

  private trim(): void {
    const sorted = this.list();
    if (sorted.length <= MAX_HISTORY) {
      return;
    }
    for (const record of sorted.slice(MAX_HISTORY)) {
      this.records.delete(record.transferId);
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.configPath), { recursive: true });
    writeFileSync(this.configPath, JSON.stringify(this.list(), null, 2), 'utf8');
  }

  private load(): TransferRecord[] {
    if (!existsSync(this.configPath)) {
      return [];
    }

    try {
      const raw = readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as TransferRecord[];
      return Array.isArray(parsed) ? parsed.filter(isTransferRecord) : [];
    } catch {
      return [];
    }
  }
}

function isTransferRecord(value: unknown): value is TransferRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<TransferRecord>;
  return (
    typeof candidate.transferId === 'string' &&
    typeof candidate.direction === 'string' &&
    typeof candidate.fileName === 'string' &&
    typeof candidate.fileSize === 'number' &&
    typeof candidate.bytesTransferred === 'number' &&
    typeof candidate.peerDeviceName === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.updatedAt === 'number'
  );
}
