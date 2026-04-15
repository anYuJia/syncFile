import { EventEmitter } from 'events';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../transfer/file-hash', () => ({
  sha256File: vi.fn()
}));

vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: {},
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn()
  },
  shell: {}
}));

import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc-channels';
import { sha256File } from '../transfer/file-hash';

import {
  registerIpcHandlers,
  handledIpcChannels,
  sourceFileCanResume,
  sourceFileHashCanResume,
  unregisterIpcHandlers
} from './handlers';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sourceFileCanResume', () => {
  it('allows resume when there is no previous transfer', () => {
    expect(sourceFileCanResume(undefined, '/tmp/demo.txt', 100, 123)).toBe(true);
  });

  it('allows resume when metadata matches', () => {
    expect(
      sourceFileCanResume(
        {
          direction: 'send',
          localPath: '/tmp/demo.txt',
          fileSize: 100,
          sourceFileModifiedAt: 123
        },
        '/tmp/demo.txt',
        100,
        123
      )
    ).toBe(true);
  });

  it('blocks resume when file metadata changed', () => {
    expect(
      sourceFileCanResume(
        {
          direction: 'send',
          localPath: '/tmp/demo.txt',
          fileSize: 100,
          sourceFileModifiedAt: 123
        },
        '/tmp/demo.txt',
        120,
        456
      )
    ).toBe(false);
  });
});

describe('sourceFileHashCanResume', () => {
  it('blocks resume when sha256 changed even if path is the same', () => {
    expect(
      sourceFileHashCanResume(
        {
          direction: 'send',
          localPath: '/tmp/demo.txt',
          fileSize: 100,
          sourceFileModifiedAt: 123,
          sourceFileSha256: 'old'
        },
        '/tmp/demo.txt',
        100,
        123,
        'new'
      )
    ).toBe(false);
  });
});

describe('unregisterIpcHandlers', () => {
  it('removes every invoke handler channel used by the preload bridge', () => {
    const removeHandler = vi.mocked(ipcMain.removeHandler);

    unregisterIpcHandlers();

    expect(removeHandler).toHaveBeenCalledTimes(handledIpcChannels.length);
    expect(removeHandler.mock.calls.map(([channel]) => channel)).toEqual(handledIpcChannels);
  });
});

describe('registerIpcHandlers', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'syncfile-handlers-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns a transfer id before background hashing completes', async () => {
    let resolveHash: ((value: string) => void) | null = null;
    vi.mocked(sha256File).mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveHash = resolve;
        })
    );

    const filePath = join(root, 'demo.txt');
    writeFileSync(filePath, 'hello');

    const registry = Object.assign(new EventEmitter(), {
      list: vi.fn(() => [
        {
          deviceId: 'peer-1',
          name: 'Peer',
          trustFingerprint: 'AAAA-BBBB-CCCC-DDDD',
          trustPublicKey: 'PUBKEY1',
          host: 'peer.local',
          address: '127.0.0.1',
          port: 43434,
          platform: 'darwin',
          version: '1'
        }
      ])
    });
    const tcpClient = Object.assign(new EventEmitter(), {
      sendFile: vi.fn().mockResolvedValue(undefined),
      pairWithPeer: vi.fn(),
      pause: vi.fn().mockReturnValue(false),
      cancel: vi.fn().mockReturnValue(false)
    });
    const tcpServer = Object.assign(new EventEmitter(), {
      cancel: vi.fn().mockReturnValue(false)
    });
    const handle = vi.mocked(ipcMain.handle);

    registerIpcHandlers({
      registry: registry as never,
      mdnsService: { refresh: vi.fn() } as never,
      tcpServer: tcpServer as never,
      tcpClient: tcpClient as never,
      sandbox: {
        rootPath: vi.fn(() => join(root, 'sandbox')),
        currentUsageBytes: vi.fn().mockResolvedValue(0),
        resumeCacheSummary: vi.fn(() => ({ count: 0, bytes: 0 })),
        discardIncomingResume: vi.fn(),
        clearResumeCache: vi.fn(() => []),
        directoryForIncoming: vi.fn(() => join(root, 'sandbox', 'peer-1')),
        setRoot: vi.fn(),
        assertContainsPath: vi.fn((path: string) => path)
      } as never,
      sandboxLocation: {
        currentPath: vi.fn(() => null),
        save: vi.fn((path: string) => path)
      } as never,
      pendingOfferStore: {
        list: vi.fn(() => []),
        upsert: vi.fn(),
        remove: vi.fn()
      } as never,
      settingsStore: {
        get: vi.fn(() => ({
          maxSandboxSizeMB: 1024,
          autoAccept: false,
          autoAcceptMaxSizeMB: 64,
          openReceivedFolder: false,
          trustedDevices: []
        })),
        save: vi.fn()
      } as never,
      transferHistoryStore: {
        list: vi.fn(() => []),
        upsert: vi.fn(),
        get: vi.fn(() => undefined),
        count: vi.fn(() => 0),
        remove: vi.fn()
      } as never,
      identity: {} as never,
      getSelfDevice: vi.fn(),
      getWindow: vi.fn(() => null)
    });

    const sendFileHandler = handle.mock.calls.find(
      ([channel]) => channel === IpcChannels.SendFile
    )?.[1] as ((event: unknown, deviceId: string, filePath: string) => Promise<{ value: string }>);

    const result = await sendFileHandler({}, 'peer-1', filePath);

    expect(result.value).toHaveLength(36);
    expect(tcpClient.sendFile).not.toHaveBeenCalled();

    expect(resolveHash).not.toBeNull();
    if (!resolveHash) {
      throw new Error('expected background hash resolver to be captured');
    }
    const resolveBackgroundHash = resolveHash as (value: string) => void;
    resolveBackgroundHash('demo-hash');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(tcpClient.sendFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath,
        fileId: result.value,
        sha256: 'demo-hash'
      })
    );
  });
});
