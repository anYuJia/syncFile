import { mkdirSync, readdirSync, statSync } from 'fs';
import { basename, join } from 'path';

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

  pathForIncoming(deviceId: string, originalFileName: string): string {
    const safeDeviceId = sanitizeSegment(deviceId);
    const deviceDir = join(this.root, safeDeviceId);
    mkdirSync(deviceDir, { recursive: true });

    const safeName = sanitizeSegment(basename(originalFileName));
    const stamp = formatTimestamp(new Date());
    return join(deviceDir, `${stamp}_${safeName}`);
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
