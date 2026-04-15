import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import type { Settings } from '../../shared/types';

const DEFAULT_SETTINGS: Settings = {
  maxSandboxSizeMB: 1024,
  autoAccept: false,
  autoAcceptMaxSizeMB: 64,
  openReceivedFolder: false,
  desktopNotifications: true,
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
    return cloneSettings(this.settings);
  }

  save(partial: Partial<Settings>): Settings {
    this.settings = normalizeSettings({ ...this.settings, ...partial });
    mkdirSync(dirname(this.configPath), { recursive: true });
    writeFileSync(this.configPath, JSON.stringify(this.settings, null, 2), 'utf8');
    return cloneSettings(this.settings);
  }

  private load(): Settings {
    if (!existsSync(this.configPath)) {
      return cloneSettings(DEFAULT_SETTINGS);
    }

    try {
      const raw = readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return normalizeSettings(parsed);
    } catch {
      return cloneSettings(DEFAULT_SETTINGS);
    }
  }
}

function normalizeSettings(input: Partial<Settings>): Settings {
  const openReceivedFolder =
    typeof input.openReceivedFolder === 'boolean'
      ? input.openReceivedFolder
      : typeof (input as { autoDownload?: boolean }).autoDownload === 'boolean'
        ? Boolean((input as { autoDownload?: boolean }).autoDownload)
        : DEFAULT_SETTINGS.openReceivedFolder;

  return {
    maxSandboxSizeMB: clampInteger(input.maxSandboxSizeMB, 64, 102400, DEFAULT_SETTINGS.maxSandboxSizeMB),
    autoAccept: typeof input.autoAccept === 'boolean' ? input.autoAccept : DEFAULT_SETTINGS.autoAccept,
    autoAcceptMaxSizeMB: clampInteger(
      input.autoAcceptMaxSizeMB,
      1,
      102400,
      DEFAULT_SETTINGS.autoAcceptMaxSizeMB
    ),
    openReceivedFolder,
    desktopNotifications:
      typeof input.desktopNotifications === 'boolean'
        ? input.desktopNotifications
        : DEFAULT_SETTINGS.desktopNotifications,
    trustedDevices: normalizeTrustedDevices(input.trustedDevices)
  };
}

function normalizeTrustedDevices(value: unknown): Settings['trustedDevices'] {
  if (!Array.isArray(value)) {
    return cloneSettings(DEFAULT_SETTINGS).trustedDevices;
  }

  const deduped = new Map<string, Settings['trustedDevices'][number]>();
  for (const item of value) {
    const normalized = normalizeTrustedDeviceRecord(item);
    if (!normalized) {
      continue;
    }
    deduped.set(`${normalized.deviceId}:${normalized.trustFingerprint}`, normalized);
  }

  return [...deduped.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function cloneSettings(settings: Settings): Settings {
  return {
    ...settings,
    trustedDevices: settings.trustedDevices.map((device) => ({ ...device }))
  };
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

function normalizeTrustedDeviceRecord(
  value: unknown
): Settings['trustedDevices'][number] | null {
  if (!isTrustedDeviceRecord(value)) {
    return null;
  }

  const candidate = value as Partial<Settings['trustedDevices'][number]>;
  return {
    deviceId: candidate.deviceId!,
    name: candidate.name!,
    trustFingerprint: candidate.trustFingerprint!,
    trustPublicKey: typeof candidate.trustPublicKey === 'string' ? candidate.trustPublicKey : '',
    trustedAt: candidate.trustedAt!
  };
}
