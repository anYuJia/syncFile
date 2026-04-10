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
  private readonly devices = new Map<string, Device>();

  upsert(device: Device): void {
    const existed = this.devices.has(device.deviceId);
    this.devices.set(device.deviceId, device);
    if (!existed) {
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
    return Array.from(this.devices.values());
  }

  clear(): void {
    const ids = Array.from(this.devices.keys());
    this.devices.clear();
    for (const id of ids) {
      this.emit('device-offline', id);
      this.emit('device:offline', id);
    }
  }
}
