import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { SettingsStore } from './settings';

describe('SettingsStore', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'syncfile-settings-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('loads defaults when no settings file exists', () => {
    const store = new SettingsStore(root);

    expect(store.get()).toEqual({
      maxSandboxSizeMB: 1024,
      autoAccept: false,
      autoAcceptMaxSizeMB: 64,
      openReceivedFolder: false,
      trustedDevices: []
    });
  });

  it('migrates legacy autoDownload to openReceivedFolder', () => {
    writeFileSync(
      join(root, 'settings.json'),
      JSON.stringify({
        maxSandboxSizeMB: 2048,
        autoAccept: true,
        autoDownload: true
      }),
      'utf8'
    );

    const store = new SettingsStore(root);

    expect(store.get()).toEqual({
      maxSandboxSizeMB: 2048,
      autoAccept: true,
      autoAcceptMaxSizeMB: 64,
      openReceivedFolder: true,
      trustedDevices: []
    });
  });

  it('loads trusted devices when present', () => {
    writeFileSync(
      join(root, 'settings.json'),
      JSON.stringify({
        maxSandboxSizeMB: 1024,
        autoAccept: false,
        autoAcceptMaxSizeMB: 32,
        openReceivedFolder: false,
        trustedDevices: [
          { deviceId: 'dev-1', name: 'Alice MacBook', trustFingerprint: 'ABCD-1234-5678-90EF', trustedAt: 1234567890 }
        ]
      }),
      'utf8'
    );

    const store = new SettingsStore(root);

    expect(store.get().trustedDevices).toEqual([
      { deviceId: 'dev-1', name: 'Alice MacBook', trustFingerprint: 'ABCD-1234-5678-90EF', trustedAt: 1234567890 }
    ]);
  });

  it('filters invalid trusted device records', () => {
    writeFileSync(
      join(root, 'settings.json'),
      JSON.stringify({
        trustedDevices: [
          { deviceId: 'dev-1', name: 'Alice MacBook', trustFingerprint: 'ABCD-1234-5678-90EF', trustedAt: 1234567890 },
          { deviceId: '', name: 'bad', trustFingerprint: 'FFFF-FFFF-FFFF-FFFF', trustedAt: 1 },
          { deviceId: 'dev-2', name: 'missing-time' }
        ]
      }),
      'utf8'
    );

    const store = new SettingsStore(root);

    expect(store.get().trustedDevices).toEqual([
      { deviceId: 'dev-1', name: 'Alice MacBook', trustFingerprint: 'ABCD-1234-5678-90EF', trustedAt: 1234567890 }
    ]);
  });
});
