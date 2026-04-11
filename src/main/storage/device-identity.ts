import { randomBytes, randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { hostname } from 'os';
import { dirname, join } from 'path';

export interface DeviceIdentity {
  deviceId: string;
  name: string;
  trustFingerprint: string;
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
        const identity: DeviceIdentity = {
          deviceId: parsed.deviceId,
          name: parsed.name,
          trustFingerprint:
            typeof parsed.trustFingerprint === 'string' && parsed.trustFingerprint.length > 0
              ? parsed.trustFingerprint
              : createTrustFingerprint()
        };
        if (!parsed.trustFingerprint) {
          mkdirSync(dirname(identityPath), { recursive: true });
          writeFileSync(identityPath, JSON.stringify(identity, null, 2), 'utf8');
        }
        return identity;
      }
    } catch {
      // Fall through to regenerate identity on invalid/corrupted file.
    }
  }

  const identity: DeviceIdentity = {
    deviceId: randomUUID(),
    name: hostname(),
    trustFingerprint: createTrustFingerprint()
  };

  mkdirSync(dirname(identityPath), { recursive: true });
  writeFileSync(identityPath, JSON.stringify(identity, null, 2), 'utf8');
  return identity;
}

function createTrustFingerprint(): string {
  const hex = randomBytes(8).toString('hex').toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}
