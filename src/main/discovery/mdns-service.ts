import { Bonjour, type Browser, type Service } from 'bonjour-service';
import type { Device } from '../../shared/types';
import type { DeviceRegistry } from './device-registry';

export const SERVICE_TYPE = 'syncfile';
export const MDNS_PROTOCOL_VERSION = '1';

export interface MdnsServiceOptions {
  registry: DeviceRegistry;
  self: {
    deviceId: string;
    name: string;
    trustFingerprint: string;
    trustPublicKey: string;
    port: number;
    platform: string;
  };
}

export class MdnsService {
  private readonly bonjour: Bonjour;
  private published?: Service;
  private browser?: Browser;

  constructor(private readonly opts: MdnsServiceOptions) {
    this.bonjour = new Bonjour();
  }

  start(): void {
    this.publish();
    this.find();
  }

  publish(): void {
    if (this.published) return;
    this.published = this.bonjour.publish({
      name: `${this.opts.self.name}-${this.opts.self.deviceId.slice(0, 8)}`,
      type: SERVICE_TYPE,
      port: this.opts.self.port,
      txt: {
        deviceId: this.opts.self.deviceId,
        displayName: this.opts.self.name,
        trustFingerprint: this.opts.self.trustFingerprint,
        trustPublicKey: this.opts.self.trustPublicKey,
        platform: this.opts.self.platform,
        version: MDNS_PROTOCOL_VERSION
      }
    });
  }

  find(): void {
    if (this.browser) return;
    const browser = this.bonjour.find({ type: SERVICE_TYPE });
    this.browser = browser;
    browser.on('up', this.onServiceUp);
    browser.on('down', this.onServiceDown);
  }

  async stop(): Promise<void> {
    if (this.browser) {
      this.browser.off('up', this.onServiceUp);
      this.browser.off('down', this.onServiceDown);
      this.browser.stop();
      this.browser = undefined;
    }

    const service = this.published;
    this.published = undefined;

    await new Promise<void>((resolve) => {
      if (!service?.stop) {
        resolve();
        return;
      }
      service.stop(() => resolve());
    });

    await new Promise<void>((resolve) => this.bonjour.destroy(() => resolve()));
  }

  private readonly onServiceUp = (service: Service): void => {
    const device = this.serviceToDevice(service);
    if (!device) return;
    if (device.deviceId === this.opts.self.deviceId) return;
    this.opts.registry.upsert(device);
  };

  private readonly onServiceDown = (service: Service): void => {
    const deviceId = this.readTxtValue(service.txt, 'deviceId');
    if (!deviceId || deviceId === this.opts.self.deviceId) return;
    this.opts.registry.remove(deviceId);
  };

  private serviceToDevice(service: Service): Device | null {
    const deviceId = this.readTxtValue(service.txt, 'deviceId');
    if (!deviceId) return null;

    const host = service.host || service.fqdn || '';
    const address = selectAddress(service.addresses, host);

    return {
      deviceId,
      name: this.readTxtValue(service.txt, 'displayName') || service.name,
      trustFingerprint: this.readTxtValue(service.txt, 'trustFingerprint') || 'UNKNOWN',
      trustPublicKey: this.readTxtValue(service.txt, 'trustPublicKey') || '',
      host,
      address,
      port: service.port,
      platform: this.readTxtValue(service.txt, 'platform') || 'unknown',
      version: this.readTxtValue(service.txt, 'version') || MDNS_PROTOCOL_VERSION
    };
  }

  private readTxtValue(txt: unknown, key: string): string | undefined {
    if (!txt || typeof txt !== 'object') return undefined;
    const raw = (txt as Record<string, unknown>)[key];
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
    if (Buffer.isBuffer(raw)) return raw.toString('utf8');
    return undefined;
  }
}

function selectAddress(addresses: string[] | undefined, host: string): string {
  if (!addresses || addresses.length === 0) return host;
  const ipv4 = addresses.find((address) => !address.includes(':'));
  return ipv4 ?? addresses[0];
}
