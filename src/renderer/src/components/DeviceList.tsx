import type { Device } from '@shared/types';
import type { Messages } from '../i18n';

interface DeviceListProps {
  devices: Device[];
  selectedDeviceId: string | null;
  trustedDeviceKeys?: Set<string>;
  onSelect: (deviceId: string) => void;
  messages: Messages;
}

function formatPlatform(platform: string): string {
  if (platform === 'darwin') return 'macOS';
  if (platform === 'win32') return 'Windows';
  if (platform === 'linux') return 'Linux';
  return platform;
}

export function DeviceList({
  devices,
  selectedDeviceId,
  trustedDeviceKeys,
  onSelect,
  messages
}: DeviceListProps): JSX.Element {
  if (devices.length === 0) {
    return (
      <div className="device-list-empty">
        <p className="device-list-empty-title">{messages.noOnlinePeers}</p>
        <p className="device-list-empty-body">{messages.keepRunningOnAnotherDevice}</p>
      </div>
    );
  }

  return (
    <ul className="device-list" role="listbox" aria-label={messages.onlineDevicesAriaLabel}>
      {devices.map((device, index) => {
        const selected = device.deviceId === selectedDeviceId;
        const trusted = trustedDeviceKeys?.has(`${device.deviceId}:${device.trustFingerprint}`) ?? false;
        return (
          <li key={device.deviceId}>
            <button
              type="button"
              className={`device-item${selected ? ' is-selected' : ''}`}
              onClick={() => onSelect(device.deviceId)}
              role="option"
              aria-selected={selected}
            >
              <span className="device-item-indicator" />

              <span className="device-item-main">
                <span className="device-item-row">
                  <span className="device-item-title">
                    <span className="device-item-name">{device.name}</span>
                    {trusted && <span className="device-item-trusted">{messages.trustedDeviceLabel}</span>}
                  </span>
                  <span className="device-item-platform">{formatPlatform(device.platform)}</span>
                </span>
                <span className="device-item-meta">
                  {device.address}:{device.port}
                </span>
                <span className="device-item-submeta">
                  ID {device.deviceId.slice(0, 8)} · {messages.deviceFingerprintLabel} {device.trustFingerprint} · v{device.version}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
