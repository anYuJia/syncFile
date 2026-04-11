import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import type { Settings } from '../../shared/types';

const DEFAULT_SETTINGS: Settings = {
  maxSandboxSizeMB: 1024,
  autoAccept: false,
  autoAcceptMaxSizeMB: 64,
  openReceivedFolder: false,
  trustedDevices: []
};

export class SettingsStore {
  private readonly configPath: string;
  private settings: Settings;

  constructor(userDataDir: string) {
    this.configPath = join(userDataDir, 'settings.json');
    this.settings = this.load();
  }

  get(): Settings {
    return { ...this.settings };
  }

  save(partial: Partial<Settings>): Settings {
    this.settings = { ...this.settings, ...partial };
    mkdirSync(dirname(this.configPath), { recursive: true });
    writeFileSync(this.configPath, JSON.stringify(this.settings, null, 2), 'utf8');
    return { ...this.settings };
  }

  private load(): Settings {
    if (!existsSync(this.configPath)) {
      return { ...DEFAULT_SETTINGS };
    }

    try {
      const raw = readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return {
        maxSandboxSizeMB:
          typeof parsed.maxSandboxSizeMB === 'number' && parsed.maxSandboxSizeMB > 0
            ? parsed.maxSandboxSizeMB
            : DEFAULT_SETTINGS.maxSandboxSizeMB,
        autoAccept: typeof parsed.autoAccept === 'boolean' ? parsed.autoAccept : DEFAULT_SETTINGS.autoAccept,
        autoAcceptMaxSizeMB:
          typeof parsed.autoAcceptMaxSizeMB === 'number' && parsed.autoAcceptMaxSizeMB > 0
            ? parsed.autoAcceptMaxSizeMB
            : DEFAULT_SETTINGS.autoAcceptMaxSizeMB,
        openReceivedFolder:
          typeof parsed.openReceivedFolder === 'boolean'
            ? parsed.openReceivedFolder
            : typeof (parsed as { autoDownload?: boolean }).autoDownload === 'boolean'
              ? Boolean((parsed as { autoDownload?: boolean }).autoDownload)
              : DEFAULT_SETTINGS.openReceivedFolder,
        trustedDevices:
          Array.isArray(parsed.trustedDevices)
            ? parsed.trustedDevices.filter(isTrustedDeviceRecord)
            : DEFAULT_SETTINGS.trustedDevices
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
}

function isTrustedDeviceRecord(value: unknown): value is Settings['trustedDevices'][number] {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<Settings['trustedDevices'][number]>;
  return (
    typeof candidate.deviceId === 'string' &&
    candidate.deviceId.length > 0 &&
    typeof candidate.name === 'string' &&
    candidate.name.length > 0 &&
    typeof candidate.trustFingerprint === 'string' &&
    candidate.trustFingerprint.length > 0 &&
    typeof candidate.trustedAt === 'number'
  );
}
