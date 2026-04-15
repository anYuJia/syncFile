import { randomUUID } from 'crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { hostname } from 'os';
import { dirname, join } from 'path';

import { safeStorage } from 'electron';

import { createTrustKeypair } from '../security/trust';

const IDENTITY_FILE_MODE = 0o600;

export interface DeviceIdentity {
  deviceId: string;
  name: string;
  trustFingerprint: string;
  trustPublicKey: string;
  trustPrivateKey: string;
}

interface PersistedDeviceIdentity {
  deviceId: string;
  name: string;
  trustFingerprint: string;
  trustPublicKey: string;
  trustPrivateKey?: string;
  trustPrivateKeyCiphertext?: string;
  trustPrivateKeyStorage?: 'plain' | 'safe-storage';
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
      const parsed = JSON.parse(raw) as Partial<PersistedDeviceIdentity>;
      if (typeof parsed.deviceId === 'string' && typeof parsed.name === 'string') {
        const storedPrivateKey = loadStoredPrivateKey(parsed);
        const keypair =
          typeof parsed.trustPublicKey === 'string' &&
          parsed.trustPublicKey.length > 0 &&
          typeof storedPrivateKey === 'string' &&
          storedPrivateKey.length > 0 &&
          typeof parsed.trustFingerprint === 'string' &&
          parsed.trustFingerprint.length > 0
            ? {
                publicKey: parsed.trustPublicKey,
                privateKey: storedPrivateKey,
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
        if (shouldPersistIdentity(parsed, storedPrivateKey, identity)) {
          persistIdentity(identityPath, identity);
        } else {
          tightenIdentityFilePermissions(identityPath);
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

  persistIdentity(identityPath, identity);
  return identity;
}

function shouldPersistIdentity(
  persisted: Partial<PersistedDeviceIdentity>,
  storedPrivateKey: string | null,
  identity: DeviceIdentity
): boolean {
  if (storedPrivateKey !== identity.trustPrivateKey) {
    return true;
  }
  if (persisted.trustPublicKey !== identity.trustPublicKey) {
    return true;
  }
  if (persisted.trustFingerprint !== identity.trustFingerprint) {
    return true;
  }

  if (safeStorage.isEncryptionAvailable()) {
    return persisted.trustPrivateKeyStorage !== 'safe-storage';
  }

  return persisted.trustPrivateKeyStorage !== 'plain';
}

function loadStoredPrivateKey(parsed: Partial<PersistedDeviceIdentity>): string | null {
  if (
    parsed.trustPrivateKeyStorage === 'safe-storage' &&
    typeof parsed.trustPrivateKeyCiphertext === 'string' &&
    parsed.trustPrivateKeyCiphertext.length > 0 &&
    safeStorage.isEncryptionAvailable()
  ) {
    try {
      return safeStorage.decryptString(Buffer.from(parsed.trustPrivateKeyCiphertext, 'base64'));
    } catch {
      return null;
    }
  }

  if (typeof parsed.trustPrivateKey === 'string' && parsed.trustPrivateKey.length > 0) {
    return parsed.trustPrivateKey;
  }

  return null;
}

function persistIdentity(identityPath: string, identity: DeviceIdentity): void {
  const persisted: PersistedDeviceIdentity = {
    deviceId: identity.deviceId,
    name: identity.name,
    trustFingerprint: identity.trustFingerprint,
    trustPublicKey: identity.trustPublicKey
  };

  if (safeStorage.isEncryptionAvailable()) {
    persisted.trustPrivateKeyStorage = 'safe-storage';
    persisted.trustPrivateKeyCiphertext = safeStorage
      .encryptString(identity.trustPrivateKey)
      .toString('base64');
  } else {
    persisted.trustPrivateKeyStorage = 'plain';
    persisted.trustPrivateKey = identity.trustPrivateKey;
  }

  mkdirSync(dirname(identityPath), { recursive: true });
  writeFileSync(identityPath, JSON.stringify(persisted, null, 2), {
    encoding: 'utf8',
    mode: IDENTITY_FILE_MODE
  });
  tightenIdentityFilePermissions(identityPath);
}

function tightenIdentityFilePermissions(identityPath: string): void {
  try {
    chmodSync(identityPath, IDENTITY_FILE_MODE);
  } catch {
    // Best effort only. Some platforms ignore POSIX mode changes.
  }
}
