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

  it('calculates total sandbox usage recursively', () => {
    const first = sandbox.pathForIncoming('device-a', 'first.txt');
    const second = sandbox.pathForIncoming('device-b', 'second.txt');

    writeFileSync(first, '1234');
    writeFileSync(second, '123456');

    expect(sandbox.currentUsageBytes()).toBe(10);
  });

  it('returns the device directory for incoming files', () => {
    const deviceDir = sandbox.directoryForIncoming('device-a');

    expect(deviceDir).toContain('device-a');
    expect(existsSync(deviceDir)).toBe(true);
  });
});
