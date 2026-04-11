import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs';
import { basename, join } from 'path';

interface IncomingResumeMeta {
  fileId: string;
  deviceId: string;
  fileName: string;
  fileSize: number;
  finalPath: string;
  partialPath: string;
}

export class Sandbox {
  constructor(private root: string) {}

  setRoot(root: string): void {
    this.root = root;
  }

  rootPath(): string {
    mkdirSync(this.root, { recursive: true });
    return this.root;
  }

  currentUsageBytes(): number {
    return directorySize(this.rootPath());
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

  prepareIncomingResume(fileId: string, deviceId: string, fileName: string, fileSize: number): {
    finalPath: string;
    partialPath: string;
    bytesReceived: number;
  } {
    const existing = this.readIncomingResumeMeta(fileId);
    if (
      existing &&
      existing.deviceId === deviceId &&
      existing.fileName === fileName &&
      existing.fileSize === fileSize &&
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
      fileName,
      fileSize,
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
  }

  incomingResumeOffset(fileId: string): number {
    const meta = this.readIncomingResumeMeta(fileId);
    if (!meta || !existsSync(meta.partialPath)) {
      return 0;
    }
    return statSync(meta.partialPath).size;
  }

  private resumeMetaPath(fileId: string): string {
    const resumeDir = join(this.rootPath(), '.resume');
    mkdirSync(resumeDir, { recursive: true });
    return join(resumeDir, `${sanitizeSegment(fileId)}.json`);
  }

  private readIncomingResumeMeta(fileId: string): IncomingResumeMeta | null {
    const metaPath = this.resumeMetaPath(fileId);
    if (!existsSync(metaPath)) {
      return null;
    }

    try {
      const raw = readFileSync(metaPath, 'utf8');
      const parsed = JSON.parse(raw) as IncomingResumeMeta;
      return parsed;
    } catch {
      return null;
    }
  }

  private writeIncomingResumeMeta(meta: IncomingResumeMeta): void {
    writeFileSync(this.resumeMetaPath(meta.fileId), JSON.stringify(meta, null, 2), 'utf8');
  }
}

function sanitizeSegment(input: string): string {
  return input.replace(/[\\/\0]/g, '_').replace(/^\.+/, '') || 'unnamed';
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

function directorySize(path: string): number {
  let total = 0;

  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const fullPath = join(path, entry.name);
    if (entry.isDirectory()) {
      total += directorySize(fullPath);
      continue;
    }
    if (entry.isFile()) {
      total += statSync(fullPath).size;
    }
  }

  return total;
}
