import { Bonjour, type Browser, type Service } from 'bonjour-service';
import type { Device } from '../../shared/types';
import type { DeviceRegistry } from './device-registry';

export const SERVICE_TYPE = 'syncfile';
export const MDNS_PROTOCOL_VERSION = '1';
const BROWSER_REFRESH_MS = 4000;

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
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(private readonly opts: MdnsServiceOptions) {
    this.bonjour = new Bonjour();
  }

  start(): void {
    this.publish();
    this.find();
    this.scheduleRefresh();
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
    browser.on('txt-update', this.onServiceUp);
    browser.on('down', this.onServiceDown);
  }

  refresh(): void {
    this.browser?.update();
  }

  async stop(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (this.browser) {
      this.browser.off('up', this.onServiceUp);
      this.browser.off('txt-update', this.onServiceUp);
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
    const address = selectAddress(service.addresses, host, service.referer?.address);

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

  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      return;
    }

    this.refreshTimer = setInterval(() => {
      this.browser?.update();
    }, BROWSER_REFRESH_MS);
  }
}

export function selectAddress(
  addresses: string[] | undefined,
  host: string,
  refererAddress?: string
): string {
  if (!addresses || addresses.length === 0) {
    if (refererAddress && !refererAddress.includes(':')) {
      return refererAddress;
    }
    return host;
  }

  if (refererAddress && addresses.includes(refererAddress)) {
    return refererAddress;
  }

  const ranked = [...addresses].sort((left, right) => {
    return scoreAddress(right, refererAddress) - scoreAddress(left, refererAddress);
  });

  return ranked[0] ?? host;
}

function scoreAddress(address: string, refererAddress?: string): number {
  if (refererAddress && address === refererAddress) {
    return 100;
  }
  if (!address.includes(':')) {
    if (refererAddress && sameIpv4Subnet(address, refererAddress)) {
      return 90;
    }
    if (isPrivateIpv4(address)) {
      return 80;
    }
    return 70;
  }
  return 10;
}

function sameIpv4Subnet(left: string, right: string): boolean {
  if (left.includes(':') || right.includes(':')) {
    return false;
  }

  const [l1, l2, l3] = left.split('.');
  const [r1, r2, r3] = right.split('.');
  return l1 === r1 && l2 === r2 && l3 === r3;
}

function isPrivateIpv4(address: string): boolean {
  if (address.startsWith('10.')) return true;
  if (address.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) return true;
  return false;
}
