import { createHash } from 'crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connect } from 'net';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { Sandbox } from '../storage/sandbox';
import { MessageDecoder, encodeMessage } from './codec';
import type { FileOfferMessage } from './protocol';
import { isFileCancel, isFileReject } from './protocol';
import { createTrustKeypair, signFileOffer, signPairRequest } from '../security/trust';
import { secureConnect } from './secure-channel';
import { TcpServer } from './tcp-server';

describe('TcpServer', () => {
  let root: string;
  let sandbox: Sandbox;
  let server: TcpServer;
  const senderIdentity = createTrustKeypair();
  const serverIdentity = createTrustKeypair();
  const serverPeer = {
    deviceId: 'server-device',
    trustFingerprint: serverIdentity.fingerprint,
    trustPublicKey: serverIdentity.publicKey
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'syncfile-srv-'));
    sandbox = new Sandbox(root);
    server = new TcpServer({
      sandbox,
      selfDevice: {
        deviceId: 'server-device',
        name: 'Server',
        trustFingerprint: serverIdentity.fingerprint,
        trustPublicKey: serverIdentity.publicKey,
        trustPrivateKey: serverIdentity.privateKey
      }
    });
  });

  afterEach(async () => {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('emits an incoming offer and writes the file when accepted', async () => {
    const port = await server.listen(0);
    const progressEvents: number[] = [];

    const offerPromise = new Promise<void>((resolve) => {
      server.on('incoming-offer', (offer, respond) => {
        expect(offer.fileName).toBe('hello.txt');
        expect(offer.fileSize).toBe(5);
        respond.accept();
        resolve();
      });
    });

    const completedPromise = new Promise<string>((resolve) => {
      server.on('transfer-complete', (info) => resolve(info.savedPath));
    });

    server.on('progress', (info) => {
      progressEvents.push(info.bytesReceived);
    });

    const rawSocket = connect(port, '127.0.0.1');
    await new Promise<void>((resolve) => rawSocket.once('connect', resolve));
    const socket = await secureConnect(rawSocket, {
      selfDevice: {
        deviceId: 'dev-a',
        name: 'A',
        trustFingerprint: senderIdentity.fingerprint,
        trustPublicKey: senderIdentity.publicKey,
        trustPrivateKey: senderIdentity.privateKey
      },
      expectedPeer: serverPeer
    });

    const unsignedOffer: Omit<FileOfferMessage, 'signature'> = {
      type: 'file-offer',
      version: 1,
      fileId: 'f1',
      fileName: 'hello.txt',
      fileSize: 5,
      sha256: createHash('sha256').update('hello').digest('hex'),
      fromDevice: {
        deviceId: 'dev-a',
        name: 'A',
        trustFingerprint: senderIdentity.fingerprint,
        trustPublicKey: senderIdentity.publicKey
      }
    };
    const offer: FileOfferMessage = {
      ...unsignedOffer,
      signature: signFileOffer(unsignedOffer, senderIdentity.privateKey)
    };

    socket.write(encodeMessage(offer));

    await new Promise<void>((resolve) => {
      socket.once('data', () => resolve());
    });

    socket.write(Buffer.from('hello'));
    socket.write(encodeMessage({ type: 'file-complete', fileId: 'f1', bytesSent: 5 }));

    await offerPromise;
    const savedPath = await completedPromise;
    socket.end();

    expect(statSync(savedPath).size).toBe(5);
    expect(readFileSync(savedPath, 'utf8')).toBe('hello');
    expect(progressEvents).toContain(5);
  });

  it('rejects the offer and ends the connection', async () => {
    const port = await server.listen(0);
    const decoder = new MessageDecoder();

    server.on('incoming-offer', (_offer, respond) => {
      respond.reject('user-declined');
    });

    const rawSocket = connect(port, '127.0.0.1');
    await new Promise<void>((resolve) => rawSocket.once('connect', resolve));
    const socket = await secureConnect(rawSocket, {
      selfDevice: {
        deviceId: 'dev-a',
        name: 'A',
        trustFingerprint: senderIdentity.fingerprint,
        trustPublicKey: senderIdentity.publicKey,
        trustPrivateKey: senderIdentity.privateKey
      },
      expectedPeer: serverPeer
    });

    const unsignedOffer: Omit<FileOfferMessage, 'signature'> = {
        type: 'file-offer',
        version: 1,
        fileId: 'f2',
        fileName: 'x.bin',
        fileSize: 10,
        fromDevice: {
          deviceId: 'dev-a',
          name: 'A',
          trustFingerprint: senderIdentity.fingerprint,
          trustPublicKey: senderIdentity.publicKey
        }
      };
    socket.write(
      encodeMessage({
        ...unsignedOffer,
        signature: signFileOffer(unsignedOffer, senderIdentity.privateKey)
      })
    );

    const rejected = await new Promise<boolean>((resolve) => {
      socket.on('data', (chunk) => {
        const messages = decoder.push(chunk);
        if (messages.some((message) => isFileReject(message))) {
          resolve(true);
        }
      });
      socket.once('end', () => resolve(false));
      setTimeout(() => resolve(false), 1000);
    });

    const ended = await new Promise<boolean>((resolve) => {
      socket.once('end', () => resolve(true));
      setTimeout(() => resolve(false), 1000);
    });

    expect(rejected).toBe(true);
    expect(ended).toBe(true);
  });

  it('sends a cancel message when receiver cancels after accepting', async () => {
    const port = await server.listen(0);
    const decoder = new MessageDecoder();

    server.on('incoming-offer', (_offer, respond) => {
      respond.accept();
      setTimeout(() => {
        server.cancel('f3');
      }, 20);
    });

    const rawSocket = connect(port, '127.0.0.1');
    await new Promise<void>((resolve) => rawSocket.once('connect', resolve));
    const socket = await secureConnect(rawSocket, {
      selfDevice: {
        deviceId: 'dev-a',
        name: 'A',
        trustFingerprint: senderIdentity.fingerprint,
        trustPublicKey: senderIdentity.publicKey,
        trustPrivateKey: senderIdentity.privateKey
      },
      expectedPeer: serverPeer
    });

    const unsignedOffer: Omit<FileOfferMessage, 'signature'> = {
        type: 'file-offer',
        version: 1,
        fileId: 'f3',
        fileName: 'x.bin',
        fileSize: 100,
        fromDevice: {
          deviceId: 'dev-a',
          name: 'A',
          trustFingerprint: senderIdentity.fingerprint,
          trustPublicKey: senderIdentity.publicKey
        }
      };
    socket.write(
      encodeMessage({
        ...unsignedOffer,
        signature: signFileOffer(unsignedOffer, senderIdentity.privateKey)
      })
    );

    const cancelReason = await new Promise<string | null>((resolve) => {
      socket.on('data', (chunk) => {
        const messages = decoder.push(chunk);
        const cancelled = messages.find((message) => isFileCancel(message));
        if (cancelled && isFileCancel(cancelled)) {
          resolve(cancelled.reason);
        }
      });
      setTimeout(() => resolve(null), 1000);
    });

    expect(cancelReason).toBe('receiver-cancelled');
  });

  it('rejects offers with invalid signatures', async () => {
    const port = await server.listen(0);
    const decoder = new MessageDecoder();

    const rawSocket = connect(port, '127.0.0.1');
    await new Promise<void>((resolve) => rawSocket.once('connect', resolve));
    const socket = await secureConnect(rawSocket, {
      selfDevice: {
        deviceId: 'dev-a',
        name: 'A',
        trustFingerprint: senderIdentity.fingerprint,
        trustPublicKey: senderIdentity.publicKey,
        trustPrivateKey: senderIdentity.privateKey
      },
      expectedPeer: serverPeer
    });

    const unsignedOffer: Omit<FileOfferMessage, 'signature'> = {
      type: 'file-offer',
      version: 1,
      fileId: 'f4',
      fileName: 'evil.bin',
      fileSize: 10,
      fromDevice: {
        deviceId: 'dev-a',
        name: 'A',
        trustFingerprint: senderIdentity.fingerprint,
        trustPublicKey: senderIdentity.publicKey
      }
    };

    socket.write(
      encodeMessage({
        ...unsignedOffer,
        signature: 'broken-signature'
      })
    );

    const rejected = await new Promise<string | null>((resolve) => {
      socket.on('data', (chunk) => {
        const messages = decoder.push(chunk);
        const reject = messages.find((message) => isFileReject(message));
        if (reject && isFileReject(reject)) {
          resolve(reject.reason);
        }
      });
      setTimeout(() => resolve(null), 1000);
    });

    expect(rejected).toBe('identity-mismatch');
  });

  it('ignores replayed pair requests within the validity window', async () => {
    const port = await server.listen(0);
    let pairRequestCount = 0;

    server.on('pair-request', (_request, respond) => {
      pairRequestCount += 1;
      respond.reject();
    });

    const unsignedRequest = {
      type: 'pair-request' as const,
      version: 1 as const,
      requestId: 'pair-replay',
      timestamp: Date.now(),
      fromDevice: {
        deviceId: 'dev-a',
        name: 'A',
        trustFingerprint: senderIdentity.fingerprint,
        trustPublicKey: senderIdentity.publicKey
      }
    };
    const request = {
      ...unsignedRequest,
      signature: signPairRequest(unsignedRequest, senderIdentity.privateKey)
    };

    const sendPairRequest = async (): Promise<void> => {
      const rawSocket = connect(port, '127.0.0.1');
      await new Promise<void>((resolve) => rawSocket.once('connect', resolve));
      const socket = await secureConnect(rawSocket, {
        selfDevice: {
          deviceId: 'dev-a',
          name: 'A',
          trustFingerprint: senderIdentity.fingerprint,
          trustPublicKey: senderIdentity.publicKey,
          trustPrivateKey: senderIdentity.privateKey
        },
        expectedPeer: serverPeer
      });

      socket.write(encodeMessage(request));
      await new Promise((resolve) => setTimeout(resolve, 60));
      socket.destroy();
    };

    await sendPairRequest();
    await sendPairRequest();

    expect(pairRequestCount).toBe(1);
  });

  it('emits a paused event when the sender disconnects mid-transfer', async () => {
    const port = await server.listen(0);

    server.on('incoming-offer', (_offer, respond) => {
      respond.accept();
    });

    const pausedPromise = new Promise<number>((resolve) => {
      server.once('transfer-paused', (info) => resolve(info.bytesReceived));
    });

    const rawSocket = connect(port, '127.0.0.1');
    await new Promise<void>((resolve) => rawSocket.once('connect', resolve));
    const socket = await secureConnect(rawSocket, {
      selfDevice: {
        deviceId: 'dev-a',
        name: 'A',
        trustFingerprint: senderIdentity.fingerprint,
        trustPublicKey: senderIdentity.publicKey,
        trustPrivateKey: senderIdentity.privateKey
      },
      expectedPeer: serverPeer
    });

    const unsignedOffer: Omit<FileOfferMessage, 'signature'> = {
      type: 'file-offer',
      version: 1,
      fileId: 'f5',
      fileName: 'partial.bin',
      fileSize: 16,
      fromDevice: {
        deviceId: 'dev-a',
        name: 'A',
        trustFingerprint: senderIdentity.fingerprint,
        trustPublicKey: senderIdentity.publicKey
      }
    };

    socket.write(
      encodeMessage({
        ...unsignedOffer,
        signature: signFileOffer(unsignedOffer, senderIdentity.privateKey)
      })
    );

    await new Promise<void>((resolve) => socket.once('data', () => resolve()));
    socket.write(Buffer.from('partial-data'));
    socket.destroy();

    await expect(pausedPromise).resolves.toBeGreaterThan(0);
  });
});
