import { afterEach, describe, expect, it } from 'vitest';
import { connect, createServer, type Server, type Socket } from 'net';

import { createTrustKeypair } from '../security/trust';
import { secureAccept, secureConnect } from './secure-channel';

describe('secure channel', () => {
  const openServers = new Set<Server>();
  const openSockets = new Set<Socket>();

  afterEach(async () => {
    for (const socket of openSockets) {
      socket.destroy();
    }
    openSockets.clear();

    await Promise.all(
      [...openServers].map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          })
      )
    );
    openServers.clear();
  });

  it('encrypts application payloads after the authenticated handshake', async () => {
    const serverIdentity = createTrustKeypair();
    const clientIdentity = createTrustKeypair();
    const plaintext = 'super-secret-payload-12345';

    let acceptedSocketPromiseResolve: ((value: Awaited<ReturnType<typeof secureAccept>>) => void) | null = null;
    const acceptedSocketPromise = new Promise<Awaited<ReturnType<typeof secureAccept>>>((resolve) => {
      acceptedSocketPromiseResolve = resolve;
    });

    const server = createServer((socket) => {
      openSockets.add(socket);
      void secureAccept(socket, {
        selfDevice: {
          deviceId: 'server-device',
          name: 'Server',
          trustFingerprint: serverIdentity.fingerprint,
          trustPublicKey: serverIdentity.publicKey,
          trustPrivateKey: serverIdentity.privateKey
        }
      }).then((secureSocket) => {
        acceptedSocketPromiseResolve?.(secureSocket);
      });
    });
    openServers.add(server);

    const port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('unexpected address'));
          return;
        }
        resolve(address.port);
      });
    });

    const rawSocket = connect(port, '127.0.0.1');
    openSockets.add(rawSocket);
    await new Promise<void>((resolve) => rawSocket.once('connect', resolve));

    const originalWrite = rawSocket.write.bind(rawSocket);
    const rawWrites: Buffer[] = [];
    const patchedWrite = ((data: string | Buffer | Uint8Array, ...args: unknown[]) => {
      rawWrites.push(Buffer.isBuffer(data) ? Buffer.from(data) : Buffer.from(data));
      return (originalWrite as (...writeArgs: unknown[]) => boolean)(data, ...args);
    }) as typeof rawSocket.write;
    rawSocket.write = patchedWrite;

    const clientSocket = await secureConnect(rawSocket, {
      selfDevice: {
        deviceId: 'client-device',
        name: 'Client',
        trustFingerprint: clientIdentity.fingerprint,
        trustPublicKey: clientIdentity.publicKey,
        trustPrivateKey: clientIdentity.privateKey
      },
      expectedPeer: {
        deviceId: 'server-device',
        trustFingerprint: serverIdentity.fingerprint,
        trustPublicKey: serverIdentity.publicKey
      }
    });
    const accepted = await acceptedSocketPromise;

    const receivedPayload = new Promise<string>((resolve) => {
      accepted.socket.once('data', (chunk: Buffer) => resolve(chunk.toString('utf8')));
    });

    clientSocket.write(plaintext);

    await expect(receivedPayload).resolves.toBe(plaintext);
    expect(Buffer.concat(rawWrites).includes(Buffer.from(plaintext, 'utf8'))).toBe(false);
  });

  it('rejects the connection when the expected peer identity does not match', async () => {
    const serverIdentity = createTrustKeypair();
    const clientIdentity = createTrustKeypair();

    const server = createServer((socket) => {
      openSockets.add(socket);
      void secureAccept(socket, {
        selfDevice: {
          deviceId: 'server-device',
          name: 'Server',
          trustFingerprint: serverIdentity.fingerprint,
          trustPublicKey: serverIdentity.publicKey,
          trustPrivateKey: serverIdentity.privateKey
        }
      });
    });
    openServers.add(server);

    const port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('unexpected address'));
          return;
        }
        resolve(address.port);
      });
    });

    const rawSocket = connect(port, '127.0.0.1');
    openSockets.add(rawSocket);
    await new Promise<void>((resolve) => rawSocket.once('connect', resolve));

    await expect(
      secureConnect(rawSocket, {
        selfDevice: {
          deviceId: 'client-device',
          name: 'Client',
          trustFingerprint: clientIdentity.fingerprint,
          trustPublicKey: clientIdentity.publicKey,
          trustPrivateKey: clientIdentity.privateKey
        },
        expectedPeer: {
          deviceId: 'server-device',
          trustFingerprint: 'FFFF-FFFF-FFFF-FFFF',
          trustPublicKey: serverIdentity.publicKey
        }
      })
    ).rejects.toThrow(/fingerprint mismatch/i);
  });
});
