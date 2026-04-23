import { Bonjour, type Browser, type Service } from 'bonjour-service';
import type { Device } from '../../shared/types';
import type { DeviceRegistry } from './device-registry';
import { logDebug, logError, logInfo, logWarn } from '../logging/runtime-log';

export const SERVICE_TYPE = 'syncfile';
export const MDNS_PROTOCOL_VERSION = '1';
const BROWSER_REFRESH_MS = 4000;
const DEVICE_STALE_MS = 45000;

export interface MdnsServiceOptions {
  registry: DeviceRegistry;
  self: {
    deviceId: string;
    name: string;
    hasAvatar: boolean;
    profileRevision: number;
    trustFingerprint: string;
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
    this.bonjour = new Bonjour({}, (error: Error) => {
      logError('discovery', 'bonjour-service socket error', error);
    });
  }

  start(): void {
    logInfo('discovery', 'starting mdns service', {
      deviceId: this.opts.self.deviceId,
      name: this.opts.self.name,
      port: this.opts.self.port,
      platform: this.opts.self.platform
    });
    this.publish();
    this.find();
    this.scheduleRefresh();
  }

  publish(): void {
    if (this.published) return;
    const serviceInstanceName = `${sanitizeServiceInstanceName(this.opts.self.name)}-${this.opts.self.deviceId.slice(0, 8)}`;
    this.published = this.bonjour.publish({
      name: serviceInstanceName,
      type: SERVICE_TYPE,
      protocol: 'tcp',
      port: this.opts.self.port,
      disableIPv6: this.opts.self.platform === 'win32',
      probe: false,
      txt: {
        deviceId: this.opts.self.deviceId,
        displayName: this.opts.self.name,
        trustFingerprint: this.opts.self.trustFingerprint,
        platform: this.opts.self.platform,
        version: MDNS_PROTOCOL_VERSION,
        hasAvatar: this.opts.self.hasAvatar ? '1' : '0',
        profileRevision: String(this.opts.self.profileRevision)
      }
    });
    this.published.on('up', () => {
      logInfo('discovery', 'mdns service published', {
        name: serviceInstanceName,
        host: this.published?.host,
        port: this.opts.self.port,
        ipv6Disabled: this.opts.self.platform === 'win32'
      });
    });
    this.published.on('error', (error) => {
      logError('discovery', 'mdns service publish error', error);
    });
  }

  find(): void {
    if (this.browser) return;
    logInfo('discovery', 'starting mdns browser');
    this.browser = this.createBrowser();
  }

  refresh(clearRegistry = false): void {
    logInfo('discovery', 'refreshing mdns browser', { clearRegistry });
    if (clearRegistry) {
      this.opts.registry.clear();
    }
    this.resetBrowser();
  }

  async updateSelf(): Promise<void> {
    logInfo('discovery', 'updating self announcement');
    const service = this.published;
    this.published = undefined;
    await new Promise<void>((resolve) => {
      if (!service?.stop) {
        resolve();
        return;
      }
      service.stop(() => resolve());
    });
    this.publish();
    this.refresh(false);
  }

  async stop(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    logInfo('discovery', 'stopping mdns service');

    if (this.browser) {
      this.destroyBrowser();
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
    if (!device) {
      logWarn('discovery', 'ignored mdns service without device id', {
        name: service.name,
        host: service.host,
        addresses: service.addresses
      });
      return;
    }
    if (device.deviceId === this.opts.self.deviceId) return;
    logInfo('discovery', 'mdns peer discovered', {
      deviceId: device.deviceId,
      name: device.name,
      host: device.host,
      address: device.address,
      port: device.port,
      platform: device.platform
    });
    this.opts.registry.upsert(device);
  };

  private readonly onServiceDown = (service: Service): void => {
    const deviceId = this.readTxtValue(service.txt, 'deviceId');
    if (!deviceId || deviceId === this.opts.self.deviceId) return;
    logInfo('discovery', 'mdns peer goodbye received', {
      deviceId,
      name: service.name,
      host: service.host
    });
    this.opts.registry.remove(deviceId, { preservePersistent: true });
  };

  private serviceToDevice(service: Service): Device | null {
    const deviceId = this.readTxtValue(service.txt, 'deviceId');
    if (!deviceId) return null;

    const host = service.host || service.fqdn || '';
    const address = selectAddress(service.addresses, host, service.referer?.address);

    return {
      deviceId,
      name: this.readTxtValue(service.txt, 'displayName') || service.name,
      hasAvatar: this.readTxtValue(service.txt, 'hasAvatar') === '1',
      profileRevision: Number(this.readTxtValue(service.txt, 'profileRevision') ?? '0') || 0,
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
      const now = Date.now();
      if (!this.browser) {
        logWarn('discovery', 'mdns browser missing during refresh tick; recreating');
        this.browser = this.createBrowser();
        return;
      }

      this.refreshKnownServices(now);

      const removedIds = this.opts.registry.pruneOlderThan(now - DEVICE_STALE_MS);
      if (removedIds.length > 0) {
        logWarn('discovery', 'pruned stale devices after missed mdns responses', {
          deviceIds: removedIds,
          staleMs: DEVICE_STALE_MS
        });
      }
      logDebug('discovery', 'mdns browser update');
      this.browser?.update();
    }, BROWSER_REFRESH_MS);
  }

  private createBrowser(): Browser {
    const browser = this.bonjour.find({ type: SERVICE_TYPE, protocol: 'tcp' });
    browser.on('up', this.onServiceUp);
    browser.on('txt-update', this.onServiceUp);
    browser.on('down', this.onServiceDown);
    browser.update();
    const warmupTimer = setTimeout(() => {
      if (this.browser === browser) {
        browser.update();
      }
    }, 750);
    warmupTimer.unref?.();
    return browser;
  }

  private destroyBrowser(): void {
    if (!this.browser) {
      return;
    }
    this.browser.off('up', this.onServiceUp);
    this.browser.off('txt-update', this.onServiceUp);
    this.browser.off('down', this.onServiceDown);
    this.browser.stop();
  }

  private resetBrowser(): void {
    this.destroyBrowser();
    this.browser = this.createBrowser();
  }

  private refreshKnownServices(seenAt: number): void {
    const services = this.browser?.services ?? [];
    for (const service of services) {
      const device = this.serviceToDevice(service);
      if (!device || device.deviceId === this.opts.self.deviceId) {
        continue;
      }
      this.opts.registry.upsert(device, seenAt);
    }
  }
}

function sanitizeServiceInstanceName(name: string): string {
  const trimmed = name.trim();
  const withoutLocal = trimmed.replace(/\.local$/i, '');
  const normalized = withoutLocal.replace(/\.+/g, '-').replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : 'syncfile';
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
