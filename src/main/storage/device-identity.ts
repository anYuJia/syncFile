import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { hostname } from 'os';
import { dirname, join } from 'path';

export interface DeviceIdentity {
  deviceId: string;
  name: string;
}

/**
 * Loads the persisted device identity from `<userData>/identity.json`.
 * Generates a new one on first run.
 */
export function loadOrCreateIdentity(userDataDir: string): DeviceIdentity {
  const identityPath = join(userDataDir, 'identity.json');

  if (existsSync(identityPath)) {
    try {
      const raw = readFileSync(identityPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<DeviceIdentity>;
      if (parsed.deviceId && parsed.name) {
        return { deviceId: parsed.deviceId, name: parsed.name };
      }
    } catch {
      // Fall through to regenerate identity on invalid/corrupted file.
    }
  }

  const identity: DeviceIdentity = {
    deviceId: randomUUID(),
    name: hostname()
  };

  mkdirSync(dirname(identityPath), { recursive: true });
  writeFileSync(identityPath, JSON.stringify(identity, null, 2), 'utf8');
  return identity;
}
