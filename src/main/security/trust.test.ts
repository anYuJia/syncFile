import { describe, expect, it } from 'vitest';

import { createTrustKeypair, fingerprintForPublicKey, signFileOffer, verifyFileOffer } from './trust';

describe('trust helpers', () => {
  it('creates matching fingerprint and verifies signed offers', () => {
    const keypair = createTrustKeypair();
    const unsignedOffer = {
      type: 'file-offer' as const,
      version: 1 as const,
      fileId: 'f1',
      fileName: 'demo.txt',
      fileSize: 10,
      sha256: 'abc123',
      fromDevice: {
        deviceId: 'dev-1',
        name: 'Device 1',
        trustFingerprint: keypair.fingerprint,
        trustPublicKey: keypair.publicKey
      }
    };

    const signed = {
      ...unsignedOffer,
      signature: signFileOffer(unsignedOffer, keypair.privateKey)
    };

    expect(fingerprintForPublicKey(keypair.publicKey)).toBe(keypair.fingerprint);
    expect(verifyFileOffer(signed)).toBe(true);
  });
});
