import { EventEmitter } from 'events';
import type { Device } from '../../shared/types';

export interface DeviceRegistryEvents {
  'device-online': (device: Device) => void;
  'device-offline': (deviceId: string) => void;
  'device:online': (device: Device) => void;
  'device:offline': (deviceId: string) => void;
}

export declare interface DeviceRegistry {
  on<K extends keyof DeviceRegistryEvents>(
    event: K,
    listener: DeviceRegistryEvents[K]
  ): this;
  once<K extends keyof DeviceRegistryEvents>(
    event: K,
    listener: DeviceRegistryEvents[K]
  ): this;
  off<K extends keyof DeviceRegistryEvents>(
    event: K,
    listener: DeviceRegistryEvents[K]
  ): this;
  emit<K extends keyof DeviceRegistryEvents>(
    event: K,
    ...args: Parameters<DeviceRegistryEvents[K]>
  ): boolean;
}

export class DeviceRegistry extends EventEmitter {
  private readonly devices = new Map<string, { device: Device; lastSeenAt: number; persistent: boolean }>();

  upsert(device: Device, seenAt = Date.now()): void {
    this.write(device, seenAt, false);
  }

  upsertPersistent(device: Device, seenAt = Date.now()): void {
    this.write(device, seenAt, true);
  }

  remove(deviceId: string, options: { preservePersistent?: boolean } = {}): void {
    const existing = this.devices.get(deviceId);
    if (!existing) return;
    if (existing.persistent && options.preservePersistent) {
      return;
    }
    this.devices.delete(deviceId);
    this.emit('device-offline', deviceId);
    this.emit('device:offline', deviceId);
  }

  list(): Device[] {
    return Array.from(this.devices.values(), (entry) => entry.device);
  }

  clear(options: { preservePersistent?: boolean } = {}): void {
    if (!options.preservePersistent) {
      const ids = Array.from(this.devices.keys());
      this.devices.clear();
      for (const id of ids) {
        this.emit('device-offline', id);
        this.emit('device:offline', id);
      }
      return;
    }

    const removedIds: string[] = [];
    for (const [id, entry] of this.devices.entries()) {
      if (entry.persistent) {
        continue;
      }
      this.devices.delete(id);
      removedIds.push(id);
    }
    for (const id of removedIds) {
      this.emit('device-offline', id);
      this.emit('device:offline', id);
    }
  }

  pruneOlderThan(cutoffTime: number): string[] {
    const removedIds: string[] = [];
    for (const [id, entry] of this.devices.entries()) {
      if (entry.persistent || entry.lastSeenAt >= cutoffTime) {
        continue;
      }
      this.devices.delete(id);
      removedIds.push(id);
      this.emit('device-offline', id);
      this.emit('device:offline', id);
    }
    return removedIds;
  }

  private write(device: Device, seenAt: number, persistent: boolean): void {
    const previousEntry = this.devices.get(device.deviceId);
    const normalizedDevice =
      previousEntry?.persistent && !persistent
        ? {
            ...device,
            host: previousEntry.device.host,
            address: previousEntry.device.address,
            port: previousEntry.device.port
          }
        : device;
    const previous = previousEntry?.device;
    const existed = previous !== undefined;
    this.devices.set(device.deviceId, {
      device: normalizedDevice,
      lastSeenAt: seenAt,
      persistent: persistent || previousEntry?.persistent === true
    });
    if (!existed || hasMeaningfulChange(previous, normalizedDevice)) {
      this.emit('device-online', normalizedDevice);
      this.emit('device:online', normalizedDevice);
    }
  }
}

function hasMeaningfulChange(previous: Device | undefined, next: Device): boolean {
  if (!previous) {
    return true;
  }

  return (
    previous.name !== next.name ||
    previous.avatarDataUrl !== next.avatarDataUrl ||
    previous.hasAvatar !== next.hasAvatar ||
    previous.profileRevision !== next.profileRevision ||
    previous.host !== next.host ||
    previous.address !== next.address ||
    previous.port !== next.port ||
    previous.platform !== next.platform ||
    previous.version !== next.version ||
    previous.trustFingerprint !== next.trustFingerprint ||
    previous.trustPublicKey !== next.trustPublicKey
  );
}
