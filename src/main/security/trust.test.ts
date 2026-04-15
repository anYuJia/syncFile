import { describe, expect, it } from 'vitest';

import {
  PAIR_REQUEST_MAX_AGE_MS,
  createTrustKeypair,
  fingerprintForPublicKey,
  signFileOffer,
  signPairRequest,
  verifyFileOffer,
  verifyPairRequest
} from './trust';

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

  it('rejects expired pair requests', () => {
    const keypair = createTrustKeypair();
    const now = 1_700_000_000_000;
    const unsignedRequest = {
      type: 'pair-request' as const,
      version: 1 as const,
      requestId: 'req-1',
      timestamp: now - PAIR_REQUEST_MAX_AGE_MS - 1,
      fromDevice: {
        deviceId: 'dev-1',
        name: 'Device 1',
        trustFingerprint: keypair.fingerprint,
        trustPublicKey: keypair.publicKey
      }
    };

    const signed = {
      ...unsignedRequest,
      signature: signPairRequest(unsignedRequest, keypair.privateKey)
    };

    expect(verifyPairRequest(signed, now)).toBe(false);
  });

  it('rejects pair requests too far in the future', () => {
    const keypair = createTrustKeypair();
    const now = 1_700_000_000_000;
    const unsignedRequest = {
      type: 'pair-request' as const,
      version: 1 as const,
      requestId: 'req-2',
      timestamp: now + 31_000,
      fromDevice: {
        deviceId: 'dev-1',
        name: 'Device 1',
        trustFingerprint: keypair.fingerprint,
        trustPublicKey: keypair.publicKey
      }
    };

    const signed = {
      ...unsignedRequest,
      signature: signPairRequest(unsignedRequest, keypair.privateKey)
    };

    expect(verifyPairRequest(signed, now)).toBe(false);
  });
});
