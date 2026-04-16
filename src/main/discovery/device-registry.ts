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
  private readonly devices = new Map<string, { device: Device; lastSeenAt: number }>();

  upsert(device: Device, seenAt = Date.now()): void {
    const previousEntry = this.devices.get(device.deviceId);
    const previous = previousEntry?.device;
    const existed = previous !== undefined;
    this.devices.set(device.deviceId, { device, lastSeenAt: seenAt });
    if (!existed || hasMeaningfulChange(previous, device)) {
      this.emit('device-online', device);
      this.emit('device:online', device);
    }
  }

  remove(deviceId: string): void {
    if (!this.devices.delete(deviceId)) return;
    this.emit('device-offline', deviceId);
    this.emit('device:offline', deviceId);
  }

  list(): Device[] {
    return Array.from(this.devices.values(), (entry) => entry.device);
  }

  clear(): void {
    const ids = Array.from(this.devices.keys());
    this.devices.clear();
    for (const id of ids) {
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
      this.devices.delete(id);
      removedIds.push(id);
      this.emit('device-offline', id);
      this.emit('device:offline', id);
    }
    return removedIds;
  }
}

function hasMeaningfulChange(previous: Device | undefined, next: Device): boolean {
  if (!previous) {
    return true;
  }

  return (
    previous.name !== next.name ||
    previous.avatarDataUrl !== next.avatarDataUrl ||
    previous.host !== next.host ||
    previous.address !== next.address ||
    previous.port !== next.port ||
    previous.platform !== next.platform ||
    previous.version !== next.version ||
    previous.trustFingerprint !== next.trustFingerprint ||
    previous.trustPublicKey !== next.trustPublicKey
  );
}
