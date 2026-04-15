import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTrustKeypair } from '../security/trust';

describe('device identity storage', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'syncfile-identity-'));
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    rmSync(root, { recursive: true, force: true });
  });

  it('stores the private key with safeStorage when encryption is available', async () => {
    vi.doMock('electron', () => ({
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (plainText: string) => Buffer.from(`enc:${plainText}`, 'utf8'),
        decryptString: (encrypted: Buffer) => encrypted.toString('utf8').replace(/^enc:/, '')
      }
    }));

    const { loadOrCreateIdentity } = await import('./device-identity');
    const identity = loadOrCreateIdentity(root);
    const persisted = JSON.parse(readFileSync(join(root, 'identity.json'), 'utf8')) as Record<string, string>;

    expect(persisted.trustPrivateKeyStorage).toBe('safe-storage');
    expect(typeof persisted.trustPrivateKeyCiphertext).toBe('string');
    expect(persisted.trustPrivateKey).toBeUndefined();

    const reloaded = loadOrCreateIdentity(root);
    expect(reloaded.trustPrivateKey).toBe(identity.trustPrivateKey);
    expect(reloaded.trustPublicKey).toBe(identity.trustPublicKey);
  });

  it('migrates legacy plaintext identities into encrypted storage when available', async () => {
    vi.doMock('electron', () => ({
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (plainText: string) => Buffer.from(`enc:${plainText}`, 'utf8'),
        decryptString: (encrypted: Buffer) => encrypted.toString('utf8').replace(/^enc:/, '')
      }
    }));

    const keypair = createTrustKeypair();
    writeFileSync(
      join(root, 'identity.json'),
      JSON.stringify(
        {
          deviceId: 'dev-1',
          name: 'Legacy',
          trustFingerprint: keypair.fingerprint,
          trustPublicKey: keypair.publicKey,
          trustPrivateKey: keypair.privateKey
        },
        null,
        2
      ),
      'utf8'
    );

    const { loadOrCreateIdentity } = await import('./device-identity');
    const identity = loadOrCreateIdentity(root);
    const persisted = JSON.parse(readFileSync(join(root, 'identity.json'), 'utf8')) as Record<string, string>;

    expect(identity.trustPrivateKey).toBe(keypair.privateKey);
    expect(persisted.trustPrivateKeyStorage).toBe('safe-storage');
    expect(persisted.trustPrivateKey).toBeUndefined();
  });

  it('falls back to restricted plaintext storage when safeStorage is unavailable', async () => {
    vi.doMock('electron', () => ({
      safeStorage: {
        isEncryptionAvailable: () => false,
        encryptString: (plainText: string) => Buffer.from(plainText, 'utf8'),
        decryptString: (encrypted: Buffer) => encrypted.toString('utf8')
      }
    }));

    const { loadOrCreateIdentity } = await import('./device-identity');
    const identity = loadOrCreateIdentity(root);
    const persisted = JSON.parse(readFileSync(join(root, 'identity.json'), 'utf8')) as Record<string, string>;

    expect(persisted.trustPrivateKeyStorage).toBe('plain');
    expect(persisted.trustPrivateKey).toBe(identity.trustPrivateKey);
    expect(persisted.trustPrivateKeyCiphertext).toBeUndefined();
  });
});
