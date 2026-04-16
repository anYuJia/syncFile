import { existsSync, mkdirSync, readFileSync, statSync } from 'fs';
import { appendFile, writeFile } from 'fs/promises';
import { join } from 'path';

import type { RuntimeLogEntry, RuntimeLogLevel } from '../../shared/types';

const MAX_IN_MEMORY_ENTRIES = 500;
const MAX_PERSISTED_ENTRIES = 2000;
const MAX_LOG_FILE_BYTES = 2 * 1024 * 1024;

type RuntimeLogListener = (entry: RuntimeLogEntry) => void;

export class RuntimeLogger {
  private readonly logPath: string;
  private readonly entries: RuntimeLogEntry[];
  private readonly listeners = new Set<RuntimeLogListener>();
  private nextSequence = 1;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(userDataDir: string) {
    const logDir = join(userDataDir, 'logs');
    mkdirSync(logDir, { recursive: true });
    this.logPath = join(logDir, 'runtime.log.jsonl');
    this.entries = this.loadRecentEntries();
    this.nextSequence = (this.entries[this.entries.length - 1]?.sequence ?? 0) + 1;
  }

  list(): RuntimeLogEntry[] {
    return [...this.entries].sort(
      (left, right) => right.timestamp - left.timestamp || right.sequence - left.sequence
    );
  }

  clear(): void {
    this.entries.length = 0;
    this.writeQueue = this.writeQueue
      .then(() => writeFile(this.logPath, '', 'utf8'))
      .then(() => {})
      .catch(() => {});
  }

  subscribe(listener: RuntimeLogListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  debug(scope: string, message: string, details?: unknown): void {
    this.log('debug', scope, message, details);
  }

  info(scope: string, message: string, details?: unknown): void {
    this.log('info', scope, message, details);
  }

  warn(scope: string, message: string, details?: unknown): void {
    this.log('warn', scope, message, details);
  }

  error(scope: string, message: string, details?: unknown): void {
    this.log('error', scope, message, details);
  }

  log(level: RuntimeLogLevel, scope: string, message: string, details?: unknown): void {
    const entry: RuntimeLogEntry = {
      sequence: this.nextSequence++,
      timestamp: Date.now(),
      level,
      scope,
      message,
      details: normalizeDetails(details)
    };

    this.entries.push(entry);
    if (this.entries.length > MAX_IN_MEMORY_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_IN_MEMORY_ENTRIES);
    }

    writeEntryToConsole(entry);
    for (const listener of this.listeners) {
      listener(entry);
    }

    this.writeQueue = this.writeQueue
      .then(async () => {
        await appendFile(this.logPath, `${JSON.stringify(entry)}\n`, 'utf8');
        if (entry.sequence % 50 === 0) {
          await this.compactIfNeeded();
        }
      })
      .then(() => {})
      .catch(() => {});
  }

  private loadRecentEntries(): RuntimeLogEntry[] {
    if (!existsSync(this.logPath)) {
      return [];
    }

    try {
      const lines = readFileSync(this.logPath, 'utf8')
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .slice(-MAX_IN_MEMORY_ENTRIES);
      return lines.flatMap((line) => {
        try {
          const parsed = JSON.parse(line) as RuntimeLogEntry;
          return isRuntimeLogEntry(parsed) ? [parsed] : [];
        } catch {
          return [];
        }
      });
    } catch {
      return [];
    }
  }

  private async compactIfNeeded(): Promise<void> {
    try {
      if (statSync(this.logPath).size <= MAX_LOG_FILE_BYTES) {
        return;
      }
      const persisted = this.entries.slice(-MAX_PERSISTED_ENTRIES);
      await writeFile(
        this.logPath,
        `${persisted.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
        'utf8'
      );
    } catch {
      // Logging must never disrupt the transfer path.
    }
  }
}

let runtimeLogger: RuntimeLogger | null = null;
let processLoggingInstalled = false;

export function initRuntimeLogger(userDataDir: string): RuntimeLogger {
  if (!runtimeLogger) {
    runtimeLogger = new RuntimeLogger(userDataDir);
  }
  return runtimeLogger;
}

export function getRuntimeLogger(): RuntimeLogger | null {
  return runtimeLogger;
}

export function installProcessLoggers(): void {
  if (processLoggingInstalled) {
    return;
  }
  processLoggingInstalled = true;

  process.on('uncaughtExceptionMonitor', (error, origin) => {
    logError('process', `uncaught exception: ${origin}`, error);
  });
  process.on('unhandledRejection', (reason) => {
    logError('process', 'unhandled rejection', reason);
  });
}

export function logDebug(scope: string, message: string, details?: unknown): void {
  logRuntime('debug', scope, message, details);
}

export function logInfo(scope: string, message: string, details?: unknown): void {
  logRuntime('info', scope, message, details);
}

export function logWarn(scope: string, message: string, details?: unknown): void {
  logRuntime('warn', scope, message, details);
}

export function logError(scope: string, message: string, details?: unknown): void {
  logRuntime('error', scope, message, details);
}

function logRuntime(
  level: RuntimeLogLevel,
  scope: string,
  message: string,
  details?: unknown
): void {
  if (runtimeLogger) {
    runtimeLogger.log(level, scope, message, details);
    return;
  }

  writeEntryToConsole({
    sequence: 0,
    timestamp: Date.now(),
    level,
    scope,
    message,
    details: normalizeDetails(details)
  });
}

function normalizeDetails(details: unknown): string | undefined {
  if (details === undefined || details === null) {
    return undefined;
  }
  if (details instanceof Error) {
    return details.stack ?? details.message;
  }
  if (typeof details === 'string') {
    return details;
  }
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

function writeEntryToConsole(entry: RuntimeLogEntry): void {
  const detail = entry.details ? ` ${entry.details}` : '';
  const line = `[syncFile:${entry.scope}] ${entry.message}${detail}`;
  if (entry.level === 'error') {
    console.error(line);
  } else if (entry.level === 'warn') {
    console.warn(line);
  } else {
    console.info(line);
  }
}

function isRuntimeLogEntry(value: unknown): value is RuntimeLogEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<RuntimeLogEntry>;
  return (
    typeof candidate.sequence === 'number' &&
    typeof candidate.timestamp === 'number' &&
    (candidate.level === 'debug' ||
      candidate.level === 'info' ||
      candidate.level === 'warn' ||
      candidate.level === 'error') &&
    typeof candidate.scope === 'string' &&
    typeof candidate.message === 'string' &&
    (candidate.details === undefined || typeof candidate.details === 'string')
  );
}
