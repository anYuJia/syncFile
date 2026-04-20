import { describe, expect, it } from 'vitest';

import { selectAddress, shouldRecreateBrowser } from './mdns-service';

describe('shouldRecreateBrowser', () => {
  it('requests a periodic browser reset before the stale window is reached', () => {
    expect(shouldRecreateBrowser(23_999, 0)).toBe(false);
    expect(shouldRecreateBrowser(24_000, 0)).toBe(true);
  });
});

describe('selectAddress', () => {
  it('prefers the response source IPv4 address when available', () => {
    expect(
      selectAddress(['192.168.0.26', '10.136.143.4'], 'peer.local', '10.136.143.4')
    ).toBe('10.136.143.4');
  });

  it('prefers same-subnet IPv4 addresses when the exact source is absent', () => {
    expect(
      selectAddress(['192.168.0.26', '10.136.143.99'], 'peer.local', '10.136.143.4')
    ).toBe('10.136.143.99');
  });

  it('falls back to the first ranked IPv4 address before IPv6', () => {
    expect(selectAddress(['fe80::1', '192.168.0.26'], 'peer.local')).toBe('192.168.0.26');
  });

  it('falls back to the host name when there are no address records', () => {
    expect(selectAddress([], 'peer.local')).toBe('peer.local');
  });
});
