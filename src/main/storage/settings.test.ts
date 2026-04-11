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
      openReceivedFolder: false
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
      openReceivedFolder: true
    });
  });
});
