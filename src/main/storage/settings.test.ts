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
      desktopNotifications: true,
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
      desktopNotifications: true,
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
        desktopNotifications: false,
        trustedDevices: [
          { deviceId: 'dev-1', name: 'Alice MacBook', trustFingerprint: 'ABCD-1234-5678-90EF', trustPublicKey: 'PUBKEY1', trustedAt: 1234567890 }
        ]
      }),
      'utf8'
    );

    const store = new SettingsStore(root);

    expect(store.get()).toMatchObject({
      desktopNotifications: false,
      trustedDevices: [
      { deviceId: 'dev-1', name: 'Alice MacBook', trustFingerprint: 'ABCD-1234-5678-90EF', trustPublicKey: 'PUBKEY1', trustedAt: 1234567890 }
      ]
    });
  });

  it('filters invalid trusted device records', () => {
    writeFileSync(
      join(root, 'settings.json'),
      JSON.stringify({
        trustedDevices: [
          { deviceId: 'dev-1', name: 'Alice MacBook', trustFingerprint: 'ABCD-1234-5678-90EF', trustPublicKey: 'PUBKEY1', trustedAt: 1234567890 },
          { deviceId: '', name: 'bad', trustFingerprint: 'FFFF-FFFF-FFFF-FFFF', trustPublicKey: 'PUBKEY2', trustedAt: 1 },
          { deviceId: 'dev-2', name: 'missing-time' }
        ]
      }),
      'utf8'
    );

    const store = new SettingsStore(root);

    expect(store.get().trustedDevices).toEqual([
      { deviceId: 'dev-1', name: 'Alice MacBook', trustFingerprint: 'ABCD-1234-5678-90EF', trustPublicKey: 'PUBKEY1', trustedAt: 1234567890 }
    ]);
  });

  it('migrates trusted devices without public keys', () => {
    writeFileSync(
      join(root, 'settings.json'),
      JSON.stringify({
        trustedDevices: [
          { deviceId: 'dev-1', name: 'Alice MacBook', trustFingerprint: 'ABCD-1234-5678-90EF', trustedAt: 1234567890 }
        ]
      }),
      'utf8'
    );

    const store = new SettingsStore(root);

    expect(store.get().trustedDevices).toEqual([
      { deviceId: 'dev-1', name: 'Alice MacBook', trustFingerprint: 'ABCD-1234-5678-90EF', trustPublicKey: '', trustedAt: 1234567890 }
    ]);
  });

  it('normalizes saved values and deduplicates trusted devices', () => {
    const store = new SettingsStore(root);

    const saved = store.save({
      maxSandboxSizeMB: 1,
      autoAcceptMaxSizeMB: 999999,
      trustedDevices: [
        { deviceId: 'dev-2', name: 'Beta', trustFingerprint: 'FFFF-0000-AAAA-BBBB', trustPublicKey: 'PUB2', trustedAt: 2 },
        { deviceId: 'dev-1', name: 'Alpha', trustFingerprint: 'AAAA-0000-BBBB-CCCC', trustPublicKey: 'PUB1', trustedAt: 1 },
        { deviceId: 'dev-1', name: 'Alpha', trustFingerprint: 'AAAA-0000-BBBB-CCCC', trustPublicKey: 'PUB1', trustedAt: 3 }
      ]
    });

    expect(saved).toEqual({
      maxSandboxSizeMB: 64,
      autoAccept: false,
      autoAcceptMaxSizeMB: 102400,
      openReceivedFolder: false,
      desktopNotifications: true,
      trustedDevices: [
        { deviceId: 'dev-1', name: 'Alpha', trustFingerprint: 'AAAA-0000-BBBB-CCCC', trustPublicKey: 'PUB1', trustedAt: 3 },
        { deviceId: 'dev-2', name: 'Beta', trustFingerprint: 'FFFF-0000-AAAA-BBBB', trustPublicKey: 'PUB2', trustedAt: 2 }
      ]
    });
  });
});
