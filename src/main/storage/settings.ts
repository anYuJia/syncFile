import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import type { Settings } from '../../shared/types';

const DEFAULT_SETTINGS: Settings = {
  maxSandboxSizeMB: 1024,
  autoAccept: false,
  autoDownload: false
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
        autoDownload: typeof parsed.autoDownload === 'boolean' ? parsed.autoDownload : DEFAULT_SETTINGS.autoDownload
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
}
