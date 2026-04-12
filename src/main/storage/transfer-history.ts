import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import type { TransferRecord, TransferProgress } from '../../shared/types';

const MAX_HISTORY = 200;

export class TransferHistoryStore {
  private readonly configPath: string;
  private readonly records = new Map<string, TransferRecord>();
  private persistTimer: NodeJS.Timeout | null = null;

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

  get(transferId: string): TransferRecord | undefined {
    return this.records.get(transferId);
  }

  replace(records: TransferRecord[]): void {
    this.records.clear();
    for (const record of records) {
      this.records.set(record.transferId, record);
    }
    this.flush();
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
    if (progress.status === 'pending' || progress.status === 'in-progress') {
      this.schedulePersist();
    } else {
      this.flush();
    }
    return record;
  }

  clear(): void {
    this.records.clear();
    this.flush();
  }

  clearFinished(): TransferRecord[] {
    for (const [id, record] of this.records.entries()) {
      if (!['pending', 'in-progress', 'paused'].includes(record.status)) {
        this.records.delete(id);
      }
    }
    this.flush();
    return this.list();
  }

  remove(transferId: string): void {
    if (this.records.delete(transferId)) {
      this.flush();
    }
  }

  markInterruptedSends(): void {
    let changed = false;
    for (const record of this.records.values()) {
      if (
        record.direction === 'send' &&
        (record.status === 'pending' || record.status === 'in-progress')
      ) {
        record.status = 'failed';
        record.error = 'App restarted before transfer completion. Retry to continue.';
        record.updatedAt = Date.now();
        changed = true;
      }
    }
    if (changed) {
      this.flush();
    }
  }

  flush(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
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

  private schedulePersist(): void {
    if (this.persistTimer) {
      return;
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persist();
    }, 100);
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
    (candidate.direction === 'send' || candidate.direction === 'receive') &&
    typeof candidate.fileName === 'string' &&
    typeof candidate.fileSize === 'number' &&
    typeof candidate.bytesTransferred === 'number' &&
    typeof candidate.peerDeviceName === 'string' &&
    ['pending', 'in-progress', 'paused', 'completed', 'failed', 'rejected', 'cancelled'].includes(
      String(candidate.status)
    ) &&
    typeof candidate.updatedAt === 'number'
  );
}
