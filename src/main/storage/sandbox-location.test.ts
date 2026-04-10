import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { SandboxLocationStore } from './sandbox-location';

describe('SandboxLocationStore', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'syncfile-sandbox-location-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns the default path before the user selects one', () => {
    const store = new SandboxLocationStore(root);
    const fallback = join(root, 'sandbox');

    expect(store.currentPath()).toBeNull();
    expect(store.resolvePath(fallback)).toBe(fallback);
  });

  it('persists the selected sandbox path', () => {
    const store = new SandboxLocationStore(root);
    const chosenPath = join(root, 'chosen-folder');

    store.save(chosenPath);

    const reloaded = new SandboxLocationStore(root);
    expect(reloaded.currentPath()).toBe(chosenPath);
    expect(reloaded.resolvePath(join(root, 'sandbox'))).toBe(chosenPath);
  });
});
