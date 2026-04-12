import { createHash, generateKeyPairSync, sign, verify, createPrivateKey, createPublicKey } from 'crypto';

import type { FileOfferMessage } from '../transfer/protocol';

export interface TrustKeypair {
  publicKey: string;
  privateKey: string;
  fingerprint: string;
}

export function createTrustKeypair(): TrustKeypair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const privateKeyDer = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

  return {
    publicKey: publicKeyDer,
    privateKey: privateKeyDer,
    fingerprint: fingerprintForPublicKey(publicKeyDer)
  };
}

export function fingerprintForPublicKey(publicKey: string): string {
  const digest = createHash('sha256').update(publicKey).digest('hex').toUpperCase();
  return `${digest.slice(0, 4)}-${digest.slice(4, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}`;
}

export function signFileOffer(
  offer: Omit<FileOfferMessage, 'signature'>,
  privateKey: string
): string {
  const key = createPrivateKey({
    key: Buffer.from(privateKey, 'base64'),
    format: 'der',
    type: 'pkcs8'
  });
  return sign(null, Buffer.from(fileOfferPayload(offer), 'utf8'), key).toString('base64');
}

export function verifyFileOffer(offer: FileOfferMessage): boolean {
  if (!offer.signature) {
    return false;
  }

  if (fingerprintForPublicKey(offer.fromDevice.trustPublicKey) !== offer.fromDevice.trustFingerprint) {
    return false;
  }

  const key = createPublicKey({
    key: Buffer.from(offer.fromDevice.trustPublicKey, 'base64'),
    format: 'der',
    type: 'spki'
  });

  return verify(
    null,
    Buffer.from(fileOfferPayload(offer), 'utf8'),
    key,
    Buffer.from(offer.signature, 'base64')
  );
}

function fileOfferPayload(offer: Omit<FileOfferMessage, 'signature'>): string {
  return JSON.stringify({
    version: offer.version,
    fileId: offer.fileId,
    fileName: offer.fileName,
    fileSize: offer.fileSize,
    mimeType: offer.mimeType ?? '',
    sha256: offer.sha256 ?? '',
    fromDevice: {
      deviceId: offer.fromDevice.deviceId,
      name: offer.fromDevice.name,
      trustFingerprint: offer.fromDevice.trustFingerprint,
      trustPublicKey: offer.fromDevice.trustPublicKey
    }
  });
}
