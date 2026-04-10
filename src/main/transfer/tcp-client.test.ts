import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { Sandbox } from '../storage/sandbox';
import { TcpClient } from './tcp-client';
import { TcpServer } from './tcp-server';

describe('TcpClient', () => {
  let root: string;
  let sandbox: Sandbox;
  let server: TcpServer;
  let port: number;

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
      selfDevice: { deviceId: 'client-device', name: 'Client' }
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
      filePath: sourcePath
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
      selfDevice: { deviceId: 'cli', name: 'cli' }
    });

    await expect(
      client.sendFile({ host: '127.0.0.1', port, filePath: sourcePath })
    ).rejects.toThrow(/declined/i);
  });
});
