import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Sandbox } from './sandbox';

describe('Sandbox', () => {
  let root: string;
  let sandbox: Sandbox;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'syncfile-test-'));
    sandbox = new Sandbox(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('creates the device subdirectory on first use', () => {
    const path = sandbox.pathForIncoming('device-1', 'hello.txt');
    writeFileSync(path, 'hi');

    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe('hi');
  });

  it('isolates files per device', () => {
    const a = sandbox.pathForIncoming('device-a', 'report.pdf');
    const b = sandbox.pathForIncoming('device-b', 'report.pdf');

    expect(a).not.toBe(b);
    expect(a).toContain('device-a');
    expect(b).toContain('device-b');
  });

  it('prefixes filenames with a timestamp to avoid collisions', () => {
    const path = sandbox.pathForIncoming('d1', 'photo.jpg');
    const filename = path.split(/[\\/]/).pop() ?? '';

    expect(filename).toMatch(/^\d{8}_\d{6}_photo\.jpg$/);
  });

  it('sanitizes dangerous filename characters', () => {
    const path = sandbox.pathForIncoming('d1', '../../etc/passwd');
    const filename = path.split(/[\\/]/).pop() ?? '';

    expect(path).not.toContain('..');
    expect(filename).toContain('passwd');
    expect(filename).not.toContain('/');
  });

  it('returns the sandbox root for openSandbox', () => {
    rmSync(root, { recursive: true, force: true });

    expect(sandbox.rootPath()).toBe(root);
    expect(existsSync(root)).toBe(true);
  });

  it('recognizes paths inside the sandbox root', () => {
    const path = sandbox.pathForIncoming('device-a', 'inside.txt');

    expect(sandbox.containsPath(path)).toBe(true);
    expect(sandbox.assertContainsPath(path)).toBe(path);
  });

  it('rejects paths outside the sandbox root', () => {
    const outsidePath = join(tmpdir(), 'syncfile-outside.txt');

    expect(sandbox.containsPath(outsidePath)).toBe(false);
    expect(() => sandbox.assertContainsPath(outsidePath)).toThrow('path is outside sandbox');
  });

  it('calculates total sandbox usage recursively', async () => {
    const first = sandbox.pathForIncoming('device-a', 'first.txt');
    const second = sandbox.pathForIncoming('device-b', 'second.txt');

    writeFileSync(first, '1234');
    writeFileSync(second, '123456');

    await expect(sandbox.currentUsageBytes()).resolves.toBe(10);
  });

  it('refreshes cached usage after the sandbox is marked dirty', async () => {
    await expect(sandbox.currentUsageBytes()).resolves.toBe(0);

    const path = sandbox.pathForIncoming('device-a', 'fresh.txt');
    writeFileSync(path, 'abc');
    sandbox.markUsageDirty();

    await expect(sandbox.currentUsageBytes()).resolves.toBe(3);
  });

  it('returns the device directory for incoming files', () => {
    const deviceDir = sandbox.directoryForIncoming('device-a');

    expect(deviceDir).toContain('device-a');
    expect(existsSync(deviceDir)).toBe(true);
  });

  it('persists and completes incoming resume state', () => {
    const prepared = sandbox.prepareIncomingResume(
      'file-1',
      'device-a',
      'Alice MacBook',
      'AAAA-BBBB-CCCC-DDDD',
      'PUBKEY1',
      'hello.txt',
      5,
      'sha-hello'
    );
    writeFileSync(prepared.partialPath, 'hello');

    expect(sandbox.incomingResumeOffset('file-1')).toBe(5);
    const finalPath = sandbox.completeIncomingResume('file-1');

    expect(finalPath).toBe(prepared.finalPath);
    expect(existsSync(finalPath)).toBe(true);
    expect(readFileSync(finalPath, 'utf8')).toBe('hello');
  });

  it('reports and clears resume cache', () => {
    const first = sandbox.prepareIncomingResume(
      'file-1',
      'device-a',
      'Alice MacBook',
      'AAAA-BBBB-CCCC-DDDD',
      'PUBKEY1',
      'hello.txt',
      5,
      'sha-hello'
    );
    const second = sandbox.prepareIncomingResume(
      'file-2',
      'device-b',
      'Bob PC',
      'EEEE-FFFF-GGGG-HHHH',
      'PUBKEY2',
      'world.txt',
      3,
      'sha-world'
    );
    writeFileSync(first.partialPath, 'hello');
    writeFileSync(second.partialPath, 'abc');

    expect(sandbox.resumeCacheSummary()).toEqual({ count: 2, bytes: 8 });

    sandbox.clearResumeCache();

    expect(sandbox.resumeCacheSummary()).toEqual({ count: 0, bytes: 0 });
  });

  it('lists resumable cache entries with device metadata', () => {
    const prepared = sandbox.prepareIncomingResume(
      'file-3',
      'device-c',
      'Carol Linux',
      'IIII-JJJJ-KKKK-LLLL',
      'PUBKEY3',
      'draft.txt',
      4,
      'sha-draft'
    );
    writeFileSync(prepared.partialPath, 'data');

    expect(sandbox.listResumeEntries()).toEqual([
      {
        fileId: 'file-3',
        deviceId: 'device-c',
        deviceName: 'Carol Linux',
        trustFingerprint: 'IIII-JJJJ-KKKK-LLLL',
        trustPublicKey: 'PUBKEY3',
        fileName: 'draft.txt',
        fileSize: 4,
        sha256: 'sha-draft',
        partialPath: prepared.partialPath,
        finalPath: prepared.finalPath,
        bytesReceived: 4
      }
    ]);
  });

  it('reports matching resume bytes only for the same incoming transfer metadata', () => {
    const prepared = sandbox.prepareIncomingResume(
      'file-4',
      'device-d',
      'Delta Laptop',
      'MMMM-NNNN-OOOO-PPPP',
      'PUBKEY4',
      'clip.mov',
      9,
      'sha-clip'
    );
    writeFileSync(prepared.partialPath, '12345');

    expect(
      sandbox.matchingResumeBytes(
        'file-4',
        'device-d',
        'Delta Laptop',
        'MMMM-NNNN-OOOO-PPPP',
        'PUBKEY4',
        'clip.mov',
        9,
        'sha-clip'
      )
    ).toBe(5);
    expect(
      sandbox.matchingResumeBytes(
        'file-4',
        'device-d',
        'Delta Laptop',
        'MMMM-NNNN-OOOO-PPPP',
        'PUBKEY4',
        'clip.mov',
        9,
        'other-sha'
      )
    ).toBe(0);
  });

  it('detects whether a resumable partial file exists', () => {
    const prepared = sandbox.prepareIncomingResume(
      'file-5',
      'device-e',
      'Echo Desktop',
      'QQQQ-RRRR-SSSS-TTTT',
      'PUBKEY5',
      'draft.bin',
      4,
      'sha-draft-bin'
    );

    expect(sandbox.hasIncomingResume('file-5')).toBe(false);

    writeFileSync(prepared.partialPath, 'ab');

    expect(sandbox.hasIncomingResume('file-5')).toBe(true);
  });
});
