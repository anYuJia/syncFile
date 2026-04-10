import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

interface SandboxLocationConfig {
  rootPath: string;
}

export class SandboxLocationStore {
  private readonly configPath: string;
  private configuredPath: string | null;

  constructor(userDataDir: string) {
    this.configPath = join(userDataDir, 'sandbox-location.json');
    this.configuredPath = this.load();
  }

  currentPath(): string | null {
    return this.configuredPath;
  }

  resolvePath(defaultPath: string): string {
    return this.configuredPath ?? defaultPath;
  }

  save(rootPath: string): string {
    const config: SandboxLocationConfig = { rootPath };
    mkdirSync(dirname(this.configPath), { recursive: true });
    writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');
    this.configuredPath = rootPath;
    return rootPath;
  }

  private load(): string | null {
    if (!existsSync(this.configPath)) {
      return null;
    }

    try {
      const raw = readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<SandboxLocationConfig>;
      return typeof parsed.rootPath === 'string' && parsed.rootPath.length > 0
        ? parsed.rootPath
        : null;
    } catch {
      return null;
    }
  }
}
