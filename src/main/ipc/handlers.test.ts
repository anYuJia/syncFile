import { describe, expect, it } from 'vitest';

import { sourceFileCanResume } from './handlers';

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
