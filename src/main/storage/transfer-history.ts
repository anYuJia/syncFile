import { existsSync, readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

import type { TransferRecord, TransferProgress } from '../../shared/types';

const MAX_HISTORY = 200;
const DEFAULT_ACTIVE_PROGRESS_PERSIST_MS = 1500;

interface TransferHistoryStoreOptions {
  activeProgressPersistMs?: number;
}

export class TransferHistoryStore {
  private readonly configPath: string;
  private readonly activeProgressPersistMs: number;
  private readonly records = new Map<string, TransferRecord>();
  private persistTimer: NodeJS.Timeout | null = null;
  private persistPromise: Promise<void> | null = null;
  private persistQueued = false;

  constructor(userDataDir: string, options: TransferHistoryStoreOptions = {}) {
    this.configPath = join(userDataDir, 'transfer-history.json');
    this.activeProgressPersistMs =
      options.activeProgressPersistMs ?? DEFAULT_ACTIVE_PROGRESS_PERSIST_MS;
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
    void this.flush().catch(() => undefined);
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

    if (isActiveTransferStatus(progress.status)) {
      if (!previous || previous.status !== progress.status) {
        void this.flush().catch(() => undefined);
      } else {
        this.schedulePersist(this.activeProgressPersistMs);
      }
    } else {
      void this.flush().catch(() => undefined);
    }
    return record;
  }

  clear(): void {
    this.records.clear();
    void this.flush().catch(() => undefined);
  }

  clearFinished(): TransferRecord[] {
    for (const [id, record] of this.records.entries()) {
      if (!['pending', 'in-progress', 'paused'].includes(record.status)) {
        this.records.delete(id);
      }
    }
    void this.flush().catch(() => undefined);
    return this.list();
  }

  clearDismissible(): TransferRecord[] {
    for (const [id, record] of this.records.entries()) {
      if (!['pending', 'in-progress', 'paused'].includes(record.status)) {
        this.records.delete(id);
      }
    }
    void this.flush().catch(() => undefined);
    return this.list();
  }

  remove(transferId: string): void {
    if (this.records.delete(transferId)) {
      void this.flush().catch(() => undefined);
    }
  }

  removeMany(transferIds: string[]): TransferRecord[] {
    let changed = false;
    for (const transferId of transferIds) {
      changed = this.records.delete(transferId) || changed;
    }
    if (changed) {
      void this.flush().catch(() => undefined);
    }
    return this.list();
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
      void this.flush().catch(() => undefined);
    }
  }

  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.persistQueued = true;
    await this.ensurePersisting();
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

  private schedulePersist(delayMs: number): void {
    if (this.persistTimer) {
      return;
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistQueued = true;
      void this.ensurePersisting().catch(() => undefined);
    }, delayMs);
  }

  private ensurePersisting(): Promise<void> {
    if (!this.persistPromise) {
      this.persistPromise = this.persistLoop().finally(() => {
        this.persistPromise = null;
        if (this.persistQueued) {
          void this.ensurePersisting();
        }
      });
    }

    return this.persistPromise;
  }

  private async persistLoop(): Promise<void> {
    while (this.persistQueued) {
      this.persistQueued = false;
      await mkdir(dirname(this.configPath), { recursive: true });
      await writeFile(this.configPath, JSON.stringify(this.list(), null, 2), 'utf8');
    }
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

function isActiveTransferStatus(status: TransferProgress['status']): boolean {
  return status === 'pending' || status === 'in-progress';
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
