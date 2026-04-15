import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs';
import { readdir, stat } from 'fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path';

interface IncomingResumeMeta {
  fileId: string;
  deviceId: string;
  deviceName: string;
  trustFingerprint: string;
  trustPublicKey: string;
  fileName: string;
  fileSize: number;
  sha256: string;
  finalPath: string;
  partialPath: string;
}

export interface ResumeCacheSummary {
  count: number;
  bytes: number;
}

export interface ResumeCacheEntry {
  fileId: string;
  deviceId: string;
  deviceName: string;
  trustFingerprint: string;
  trustPublicKey: string;
  fileName: string;
  fileSize: number;
  sha256: string;
  partialPath: string;
  finalPath: string;
  bytesReceived: number;
}

export class Sandbox {
  private usageBytes: number | null = null;
  private usageRefreshPromise: Promise<number> | null = null;
  private usageDirty = true;
  private usageDirtyWhileRefreshing = false;

  constructor(private root: string) {}

  setRoot(root: string): void {
    this.root = root;
    this.markUsageDirty();
  }

  rootPath(): string {
    mkdirSync(this.root, { recursive: true });
    return this.root;
  }

  containsPath(targetPath: string): boolean {
    return isPathWithinRoot(this.rootPath(), targetPath);
  }

  assertContainsPath(targetPath: string): string {
    if (!this.containsPath(targetPath)) {
      throw new Error('path is outside sandbox');
    }
    return targetPath;
  }

  async currentUsageBytes(): Promise<number> {
    if (!this.usageDirty && this.usageBytes !== null) {
      return this.usageBytes;
    }

    return this.refreshUsageBytes();
  }

  markUsageDirty(): void {
    this.usageDirty = true;
    if (this.usageRefreshPromise) {
      this.usageDirtyWhileRefreshing = true;
    }
  }

  directoryForIncoming(deviceId: string): string {
    const safeDeviceId = sanitizeSegment(deviceId);
    const deviceDir = join(this.root, safeDeviceId);
    mkdirSync(deviceDir, { recursive: true });
    return deviceDir;
  }

  pathForIncoming(deviceId: string, originalFileName: string): string {
    const deviceDir = this.directoryForIncoming(deviceId);
    const safeName = sanitizeSegment(basename(originalFileName));
    const stamp = formatTimestamp(new Date());
    return join(deviceDir, `${stamp}_${safeName}`);
  }

  prepareIncomingResume(
    fileId: string,
    deviceId: string,
    deviceName: string,
    trustFingerprint: string,
    trustPublicKey: string,
    fileName: string,
    fileSize: number,
    sha256: string
  ): {
    finalPath: string;
    partialPath: string;
    bytesReceived: number;
  } {
    const existing = this.readIncomingResumeMeta(fileId);
    if (
      existing &&
      isMatchingIncomingResume(existing, {
        deviceId,
        deviceName,
        trustFingerprint,
        trustPublicKey,
        fileName,
        fileSize,
        sha256
      }) &&
      existsSync(existing.partialPath)
    ) {
      return {
        finalPath: existing.finalPath,
        partialPath: existing.partialPath,
        bytesReceived: statSync(existing.partialPath).size
      };
    }

    const finalPath = this.pathForIncoming(deviceId, fileName);
    const partialPath = `${finalPath}.part`;
    const meta: IncomingResumeMeta = {
      fileId,
      deviceId,
      deviceName,
      trustFingerprint,
      trustPublicKey,
      fileName,
      fileSize,
      sha256,
      finalPath,
      partialPath
    };
    this.writeIncomingResumeMeta(meta);

    return {
      finalPath,
      partialPath,
      bytesReceived: 0
    };
  }

  completeIncomingResume(fileId: string): string {
    const meta = this.readIncomingResumeMeta(fileId);
    if (!meta) {
      throw new Error(`resume state ${fileId} not found`);
    }
    renameSync(meta.partialPath, meta.finalPath);
    rmSync(this.resumeMetaPath(fileId), { force: true });
    this.markUsageDirty();
    return meta.finalPath;
  }

  discardIncomingResume(fileId: string, removePartial: boolean): void {
    const meta = this.readIncomingResumeMeta(fileId);
    if (!meta) {
      return;
    }
    if (removePartial) {
      rmSync(meta.partialPath, { force: true });
    }
    rmSync(this.resumeMetaPath(fileId), { force: true });
    this.markUsageDirty();
  }

  incomingResumeOffset(fileId: string): number {
    const meta = this.readIncomingResumeMeta(fileId);
    if (!meta || !existsSync(meta.partialPath)) {
      return 0;
    }
    return statSync(meta.partialPath).size;
  }

  matchingResumeBytes(
    fileId: string,
    deviceId: string,
    deviceName: string,
    trustFingerprint: string,
    trustPublicKey: string,
    fileName: string,
    fileSize: number,
    sha256: string
  ): number {
    const meta = this.readIncomingResumeMeta(fileId);
    if (
      !meta ||
      !isMatchingIncomingResume(meta, {
        deviceId,
        deviceName,
        trustFingerprint,
        trustPublicKey,
        fileName,
        fileSize,
        sha256
      }) ||
      !existsSync(meta.partialPath)
    ) {
      return 0;
    }

    return statSync(meta.partialPath).size;
  }

  hasIncomingResume(fileId: string): boolean {
    const meta = this.readIncomingResumeMeta(fileId);
    return Boolean(meta && existsSync(meta.partialPath));
  }

  resumeCacheSummary(): ResumeCacheSummary {
    const entries = this.listResumeEntries();
    return {
      count: entries.length,
      bytes: entries.reduce((total, entry) => total + entry.bytesReceived, 0)
    };
  }

  clearResumeCache(excludedFileIds: Set<string> = new Set()): string[] {
    const cleared: string[] = [];
    for (const entry of this.listResumeEntries()) {
      if (excludedFileIds.has(entry.fileId)) {
        continue;
      }
      this.discardIncomingResume(entry.fileId, true);
      cleared.push(entry.fileId);
    }
    return cleared;
  }

  listResumeEntries(): ResumeCacheEntry[] {
    const resumeDir = this.resumeDirectoryPath();
    if (!existsSync(resumeDir)) {
      return [];
    }

    const entries: ResumeCacheEntry[] = [];
    for (const entry of readdirSync(resumeDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
      }
      const fileId = entry.name.slice(0, -5);
      const meta = this.readIncomingResumeMeta(fileId);
      if (!meta || !existsSync(meta.partialPath)) {
        continue;
      }
      entries.push({
        fileId: meta.fileId,
        deviceId: meta.deviceId,
        deviceName: meta.deviceName,
        trustFingerprint: meta.trustFingerprint,
        trustPublicKey: meta.trustPublicKey,
        fileName: meta.fileName,
        fileSize: meta.fileSize,
        sha256: meta.sha256,
        partialPath: meta.partialPath,
        finalPath: meta.finalPath,
        bytesReceived: statSync(meta.partialPath).size
      });
    }

    return entries;
  }

  private resumeMetaPath(fileId: string): string {
    const resumeDir = this.resumeDirectoryPath();
    return join(resumeDir, `${sanitizeSegment(fileId)}.json`);
  }

  private resumeDirectoryPath(): string {
    const resumeDir = join(this.rootPath(), '.resume');
    mkdirSync(resumeDir, { recursive: true });
    return resumeDir;
  }

  private readIncomingResumeMeta(fileId: string): IncomingResumeMeta | null {
    const metaPath = this.resumeMetaPath(fileId);
    if (!existsSync(metaPath)) {
      return null;
    }

    try {
      const raw = readFileSync(metaPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<IncomingResumeMeta>;
      if (
        typeof parsed.fileId !== 'string' ||
        typeof parsed.deviceId !== 'string' ||
        typeof parsed.fileName !== 'string' ||
        typeof parsed.fileSize !== 'number' ||
        typeof parsed.sha256 !== 'string' ||
        typeof parsed.finalPath !== 'string' ||
        typeof parsed.partialPath !== 'string'
      ) {
        return null;
      }
      const normalized: IncomingResumeMeta = {
        fileId: parsed.fileId,
        deviceId: parsed.deviceId,
        deviceName: typeof parsed.deviceName === 'string' && parsed.deviceName.length > 0 ? parsed.deviceName : parsed.deviceId,
        trustFingerprint:
          typeof parsed.trustFingerprint === 'string' && parsed.trustFingerprint.length > 0
            ? parsed.trustFingerprint
            : '',
        trustPublicKey:
          typeof parsed.trustPublicKey === 'string' && parsed.trustPublicKey.length > 0
            ? parsed.trustPublicKey
            : '',
        fileName: parsed.fileName,
        fileSize: parsed.fileSize,
        sha256: parsed.sha256,
        finalPath: parsed.finalPath,
        partialPath: parsed.partialPath
      };
      return normalized;
    } catch {
      return null;
    }
  }

  private writeIncomingResumeMeta(meta: IncomingResumeMeta): void {
    writeFileSync(this.resumeMetaPath(meta.fileId), JSON.stringify(meta, null, 2), 'utf8');
    this.markUsageDirty();
  }

  private refreshUsageBytes(): Promise<number> {
    if (this.usageRefreshPromise) {
      return this.usageRefreshPromise;
    }

    this.usageDirtyWhileRefreshing = false;
    this.usageRefreshPromise = directorySize(this.rootPath())
      .then((totalBytes) => {
        this.usageBytes = totalBytes;
        this.usageDirty = this.usageDirtyWhileRefreshing;
        return totalBytes;
      })
      .finally(() => {
        this.usageRefreshPromise = null;
      });

    return this.usageRefreshPromise;
  }
}

function sanitizeSegment(input: string): string {
  return input.replace(/[\\/\0]/g, '_').replace(/^\.+/, '') || 'unnamed';
}

function isMatchingIncomingResume(
  existing: IncomingResumeMeta,
  candidate: {
    deviceId: string;
    deviceName: string;
    trustFingerprint: string;
    trustPublicKey: string;
    fileName: string;
    fileSize: number;
    sha256: string;
  }
): boolean {
  return (
    existing.deviceId === candidate.deviceId &&
    existing.deviceName === candidate.deviceName &&
    existing.trustFingerprint === candidate.trustFingerprint &&
    existing.trustPublicKey === candidate.trustPublicKey &&
    existing.fileName === candidate.fileName &&
    existing.fileSize === candidate.fileSize &&
    existing.sha256 === candidate.sha256
  );
}

function formatTimestamp(d: Date): string {
  const yyyy = d.getFullYear().toString();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

async function directorySize(path: string): Promise<number> {
  let total = 0;

  for (const entry of await readdir(path, { withFileTypes: true })) {
    const fullPath = join(path, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(fullPath);
      continue;
    }
    if (entry.isFile()) {
      total += (await stat(fullPath)).size;
    }
  }

  return total;
}

function isPathWithinRoot(rootPath: string, targetPath: string): boolean {
  const normalizedRoot = normalizePathForComparison(rootPath);
  const normalizedTarget = normalizePathForComparison(targetPath);
  const relativePath = relative(normalizedRoot, normalizedTarget);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function normalizePathForComparison(path: string): string {
  const missingSegments: string[] = [];
  let resolvedPath = resolve(path);

  while (!existsSync(resolvedPath)) {
    const parent = dirname(resolvedPath);
    if (parent === resolvedPath) {
      return resolvedPath;
    }
    missingSegments.unshift(basename(resolvedPath));
    resolvedPath = parent;
  }

  try {
    const normalizedPath = realpathSync.native(resolvedPath);
    return missingSegments.length > 0 ? join(normalizedPath, ...missingSegments) : normalizedPath;
  } catch {
    const normalizedPath = realpathSync(resolvedPath);
    return missingSegments.length > 0 ? join(normalizedPath, ...missingSegments) : normalizedPath;
  }
}
