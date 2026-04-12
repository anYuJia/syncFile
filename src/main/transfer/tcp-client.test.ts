import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createServer, type Server, type Socket } from 'net';

import { Sandbox } from '../storage/sandbox';
import { createTrustKeypair } from '../security/trust';
import { sha256File } from './file-hash';
import { TcpClient } from './tcp-client';
import { TcpServer } from './tcp-server';

describe('TcpClient', () => {
  let root: string;
  let sandbox: Sandbox;
  let server: TcpServer;
  let port: number;
  const clientIdentity = createTrustKeypair();

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'syncfile-cli-'));
    sandbox = new Sandbox(root);
    server = new TcpServer({ sandbox });
    server.on('incoming-offer', (_offer, respond) => respond.accept());
    port = await server.listen(0);
  });

  afterEach(async () => {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('sends a file end-to-end and reports progress', async () => {
    const sourcePath = join(root, 'source.txt');
    writeFileSync(sourcePath, 'hello world');

    const client = new TcpClient({
      selfDevice: {
        deviceId: 'client-device',
        name: 'Client',
        trustFingerprint: clientIdentity.fingerprint,
        trustPublicKey: clientIdentity.publicKey,
        trustPrivateKey: clientIdentity.privateKey
      }
    });

    const progressEvents: number[] = [];
    client.on('progress', (progress) => {
      progressEvents.push(progress.bytesTransferred);
    });

    const savedPathPromise = new Promise<string>((resolve) => {
      server.on('transfer-complete', (info) => resolve(info.savedPath));
    });

    await client.sendFile({
      host: '127.0.0.1',
      port,
      filePath: sourcePath,
      sha256: await sha256File(sourcePath)
    });

    const savedPath = await savedPathPromise;
    expect(readFileSync(savedPath, 'utf8')).toBe('hello world');
    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents[progressEvents.length - 1]).toBe(11);
  });

  it('rejects the promise if the peer declines the offer', async () => {
    server.removeAllListeners('incoming-offer');
    server.on('incoming-offer', (_offer, respond) => respond.reject('user-declined'));

    const sourcePath = join(root, 'source2.txt');
    writeFileSync(sourcePath, 'data');

    const client = new TcpClient({
      selfDevice: {
        deviceId: 'cli',
        name: 'cli',
        trustFingerprint: clientIdentity.fingerprint,
        trustPublicKey: clientIdentity.publicKey,
        trustPrivateKey: clientIdentity.privateKey
      }
    });

    await expect(
      client.sendFile({ host: '127.0.0.1', port, filePath: sourcePath, sha256: await sha256File(sourcePath) })
    ).rejects.toThrow(/declined/i);
  });

  it('cancels an in-progress transfer', async () => {
    const sourcePath = join(root, 'large.bin');
    writeFileSync(sourcePath, Buffer.alloc(512 * 1024, 7));

    const client = new TcpClient({
      selfDevice: {
        deviceId: 'client-device',
        name: 'Client',
        trustFingerprint: clientIdentity.fingerprint,
        trustPublicKey: clientIdentity.publicKey,
        trustPrivateKey: clientIdentity.privateKey
      }
    });

    let cancelled = false;
    client.on('progress', (progress) => {
      if (!cancelled && progress.bytesTransferred > 0) {
        cancelled = client.cancel('cancel-me');
      }
    });

    await expect(
      client.sendFile({
        host: '127.0.0.1',
        port,
        filePath: sourcePath,
        fileId: 'cancel-me',
        sha256: await sha256File(sourcePath)
      })
    ).rejects.toThrow(/cancelled/i);
    expect(cancelled).toBe(true);
  });

  it('resumes a cancelled transfer when retried with the same file id', async () => {
    const sourcePath = join(root, 'resume.bin');
    writeFileSync(sourcePath, Buffer.alloc(512 * 1024, 9));

    const client = new TcpClient({
      selfDevice: {
        deviceId: 'client-device',
        name: 'Client',
        trustFingerprint: clientIdentity.fingerprint,
        trustPublicKey: clientIdentity.publicKey,
        trustPrivateKey: clientIdentity.privateKey
      }
    });

    let cancelled = false;
    client.on('progress', (progress) => {
      if (!cancelled && progress.fileId === 'resume-me' && progress.bytesTransferred > 0) {
        cancelled = client.cancel('resume-me');
      }
    });

    await expect(
      client.sendFile({
        host: '127.0.0.1',
        port,
        filePath: sourcePath,
        fileId: 'resume-me',
        sha256: await sha256File(sourcePath)
      })
    ).rejects.toThrow(/cancelled/i);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const savedPathPromise = new Promise<string>((resolve) => {
      server.once('transfer-complete', (info) => resolve(info.savedPath));
    });

    await client.sendFile({
      host: '127.0.0.1',
      port,
      filePath: sourcePath,
      fileId: 'resume-me',
      sha256: await sha256File(sourcePath)
    });

    const savedPath = await savedPathPromise;
    expect(Buffer.compare(readFileSync(savedPath), readFileSync(sourcePath))).toBe(0);
  });

  it('completes a pairing request handshake', async () => {
    const client = new TcpClient({
      selfDevice: {
        deviceId: 'client-device',
        name: 'Client',
        trustFingerprint: clientIdentity.fingerprint,
        trustPublicKey: clientIdentity.publicKey,
        trustPrivateKey: clientIdentity.privateKey
      }
    });

    server.once('pair-request', (_request, respond) => {
      respond.accept();
    });

    await expect(client.pairWithPeer('127.0.0.1', port)).resolves.toBe(true);
  });

  it('pauses an in-progress transfer and allows it to resume later', async () => {
    const sourcePath = join(root, 'pause.bin');
    writeFileSync(sourcePath, Buffer.alloc(512 * 1024, 5));

    const client = new TcpClient({
      selfDevice: {
        deviceId: 'client-device',
        name: 'Client',
        trustFingerprint: clientIdentity.fingerprint,
        trustPublicKey: clientIdentity.publicKey,
        trustPrivateKey: clientIdentity.privateKey
      }
    });

    const pausedPromise = new Promise<number>((resolve) => {
      server.once('transfer-paused', (info) => resolve(info.bytesReceived));
    });

    let paused = false;
    client.on('progress', (progress) => {
      if (!paused && progress.fileId === 'pause-me' && progress.bytesTransferred > 0) {
        paused = client.pause('pause-me');
      }
    });

    await expect(
      client.sendFile({
        host: '127.0.0.1',
        port,
        filePath: sourcePath,
        fileId: 'pause-me',
        sha256: await sha256File(sourcePath)
      })
    ).rejects.toThrow(/paused/i);

    await expect(pausedPromise).resolves.toBeGreaterThan(0);

    const savedPathPromise = new Promise<string>((resolve) => {
      server.once('transfer-complete', (info) => resolve(info.savedPath));
    });

    await client.sendFile({
      host: '127.0.0.1',
      port,
      filePath: sourcePath,
      fileId: 'pause-me',
      sha256: await sha256File(sourcePath)
    });

    const savedPath = await savedPathPromise;
    expect(Buffer.compare(readFileSync(savedPath), readFileSync(sourcePath))).toBe(0);
  });

  it('times out pairing when the peer never responds', async () => {
    const idleConnections = new Set<Socket>();
    let idleServer: Server | null = createServer((socket) => {
      idleConnections.add(socket);
      socket.once('close', () => {
        idleConnections.delete(socket);
      });
      // Intentionally keep the socket open without replying.
    });
    const idlePort = await new Promise<number>((resolve, reject) => {
      idleServer!.once('error', reject);
      idleServer!.listen(0, '127.0.0.1', () => {
        const address = idleServer!.address();
        if (!address || typeof address === 'string') {
          reject(new Error('unexpected address'));
          return;
        }
        resolve(address.port);
      });
    });

    const client = new TcpClient({
      selfDevice: {
        deviceId: 'client-device',
        name: 'Client',
        trustFingerprint: clientIdentity.fingerprint,
        trustPublicKey: clientIdentity.publicKey,
        trustPrivateKey: clientIdentity.privateKey
      },
      responseTimeoutMs: 1000,
      idleTimeoutMs: 50
    });

    await expect(client.pairWithPeer('127.0.0.1', idlePort)).rejects.toThrow(/timed out/i);
    for (const socket of idleConnections) {
      socket.destroy();
    }
    await new Promise<void>((resolve) => idleServer!.close(() => resolve()));
    idleServer = null;
  }, 2000);
});
