import { describe, expect, it, vi } from 'vitest';

import type { Device } from '../../shared/types';
import { DeviceRegistry } from './device-registry';

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    deviceId: 'dev-1',
    name: 'Peer',
    trustFingerprint: 'ABCD-1234-5678-90EF',
    trustPublicKey: 'PUBLIC',
    host: 'peer.local',
    address: '10.0.0.10',
    port: 43434,
    platform: 'darwin',
    version: '1',
    ...overrides
  };
}

describe('DeviceRegistry', () => {
  it('emits device-online for a new device', () => {
    const registry = new DeviceRegistry();
    const listener = vi.fn();
    registry.on('device-online', listener);

    registry.upsert(makeDevice());

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('emits device-online again when a device address changes', () => {
    const registry = new DeviceRegistry();
    const listener = vi.fn();
    registry.on('device-online', listener);

    registry.upsert(makeDevice({ address: '192.168.0.20' }));
    registry.upsert(makeDevice({ address: '10.136.143.4' }));

    expect(listener).toHaveBeenCalledTimes(2);
    expect(registry.list()[0]?.address).toBe('10.136.143.4');
  });

  it('does not emit device-online when nothing meaningful changed', () => {
    const registry = new DeviceRegistry();
    const listener = vi.fn();
    registry.on('device-online', listener);

    const device = makeDevice();
    registry.upsert(device);
    registry.upsert({ ...device });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
