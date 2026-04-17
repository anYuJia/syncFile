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
  private readonly devices = new Map<
    string,
    { device: Device; lastSeenAt: number; persistent: boolean; online: boolean }
  >();

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
      this.markOffline(deviceId);
      return;
    }
    this.devices.delete(deviceId);
    this.emitOfflineIfNeeded(deviceId, existing.online);
  }

  list(): Device[] {
    return Array.from(this.devices.values(), (entry) => entry)
      .filter((entry) => entry.online)
      .map((entry) => entry.device);
  }

  listAll(): Device[] {
    return Array.from(this.devices.values(), (entry) => entry.device);
  }

  clear(options: { preservePersistent?: boolean } = {}): void {
    if (!options.preservePersistent) {
      const ids = Array.from(this.devices.entries())
        .filter(([, entry]) => entry.online)
        .map(([id]) => id);
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
        if (entry.online) {
          this.devices.set(id, {
            ...entry,
            online: false
          });
          removedIds.push(id);
        }
        continue;
      }
      this.devices.delete(id);
      if (entry.online) {
        removedIds.push(id);
      }
    }
    for (const id of removedIds) {
      this.emit('device-offline', id);
      this.emit('device:offline', id);
    }
  }

  pruneOlderThan(cutoffTime: number): string[] {
    const removedIds: string[] = [];
    for (const [id, entry] of this.devices.entries()) {
      if (entry.lastSeenAt >= cutoffTime) {
        continue;
      }
      if (entry.persistent) {
        this.markOffline(id);
        continue;
      }
      this.devices.delete(id);
      removedIds.push(id);
      this.emitOfflineIfNeeded(id, entry.online);
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
    const online = persistent ? previousEntry?.online ?? false : true;
    this.devices.set(device.deviceId, {
      device: normalizedDevice,
      lastSeenAt: seenAt,
      persistent: persistent || previousEntry?.persistent === true,
      online
    });
    if (online && (!previousEntry?.online || !existed || hasMeaningfulChange(previous, normalizedDevice))) {
      this.emit('device-online', normalizedDevice);
      this.emit('device:online', normalizedDevice);
    }
  }

  private markOffline(deviceId: string): void {
    const entry = this.devices.get(deviceId);
    if (!entry || !entry.online) {
      return;
    }
    this.devices.set(deviceId, {
      ...entry,
      online: false
    });
    this.emitOfflineIfNeeded(deviceId, true);
  }

  private emitOfflineIfNeeded(deviceId: string, wasOnline: boolean): void {
    if (!wasOnline) {
      return;
    }
    this.emit('device-offline', deviceId);
    this.emit('device:offline', deviceId);
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
