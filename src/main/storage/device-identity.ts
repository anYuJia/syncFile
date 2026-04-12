import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { hostname } from 'os';
import { dirname, join } from 'path';

import { createTrustKeypair } from '../security/trust';

export interface DeviceIdentity {
  deviceId: string;
  name: string;
  trustFingerprint: string;
  trustPublicKey: string;
  trustPrivateKey: string;
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
        const keypair =
          typeof parsed.trustPublicKey === 'string' &&
          parsed.trustPublicKey.length > 0 &&
          typeof parsed.trustPrivateKey === 'string' &&
          parsed.trustPrivateKey.length > 0 &&
          typeof parsed.trustFingerprint === 'string' &&
          parsed.trustFingerprint.length > 0
            ? {
                publicKey: parsed.trustPublicKey,
                privateKey: parsed.trustPrivateKey,
                fingerprint: parsed.trustFingerprint
              }
            : createTrustKeypair();
        const identity: DeviceIdentity = {
          deviceId: parsed.deviceId,
          name: parsed.name,
          trustFingerprint: keypair.fingerprint,
          trustPublicKey: keypair.publicKey,
          trustPrivateKey: keypair.privateKey
        };
        if (!parsed.trustFingerprint || !parsed.trustPublicKey || !parsed.trustPrivateKey) {
          mkdirSync(dirname(identityPath), { recursive: true });
          writeFileSync(identityPath, JSON.stringify(identity, null, 2), 'utf8');
        }
        return identity;
      }
    } catch {
      // Fall through to regenerate identity on invalid/corrupted file.
    }
  }

  const keypair = createTrustKeypair();
  const identity: DeviceIdentity = {
    deviceId: randomUUID(),
    name: hostname(),
    trustFingerprint: keypair.fingerprint,
    trustPublicKey: keypair.publicKey,
    trustPrivateKey: keypair.privateKey
  };

  mkdirSync(dirname(identityPath), { recursive: true });
  writeFileSync(identityPath, JSON.stringify(identity, null, 2), 'utf8');
  return identity;
}
