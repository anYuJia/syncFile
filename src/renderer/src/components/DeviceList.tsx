import type { Device } from '@shared/types';
import type { Messages } from '../i18n';

interface DeviceListProps {
  devices: Device[];
  selectedDeviceId: string | null;
  trustedDeviceKeys?: Set<string>;
  onSelect: (deviceId: string) => void;
  onRefresh?: () => void | Promise<void>;
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
  onRefresh,
  messages
}: DeviceListProps): JSX.Element {
  if (devices.length === 0) {
    return (
      <div className="device-list-empty">
        <p className="device-list-empty-title">{messages.noOnlinePeers}</p>
        <p className="device-list-empty-body">{messages.keepRunningOnAnotherDevice}</p>
        <ol className="device-list-empty-steps">
          <li>{messages.deviceListEmptyStepOpen}</li>
          <li>{messages.deviceListEmptyStepLan}</li>
          <li>{messages.deviceListEmptyStepRefresh}</li>
        </ol>
        {onRefresh && (
          <button type="button" className="button button-ghost device-list-empty-refresh" onClick={() => void onRefresh()}>
            {messages.refreshDevices}
          </button>
        )}
      </div>
    );
  }

  return (
    <ul className="device-list" role="listbox" aria-label={messages.onlineDevicesAriaLabel}>
      {devices.map((device, index) => {
        const selected = device.deviceId === selectedDeviceId;
        const trusted = trustedDeviceKeys?.has(`${device.deviceId}:${device.trustFingerprint}`) ?? false;
        const optionId = `device-option-${device.deviceId}`;
        const moveSelection = (targetIndex: number): void => {
          const nextDevice = devices[targetIndex];
          if (!nextDevice) {
            return;
          }
          onSelect(nextDevice.deviceId);
          const nextElement = document.getElementById(`device-option-${nextDevice.deviceId}`);
          if (nextElement instanceof HTMLButtonElement) {
            nextElement.focus();
          }
        };
        return (
          <li key={device.deviceId}>
            <button
              id={optionId}
              type="button"
              className={`device-item${selected ? ' is-selected' : ''}`}
              onClick={() => onSelect(device.deviceId)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  moveSelection(Math.min(devices.length - 1, index + 1));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  moveSelection(Math.max(0, index - 1));
                } else if (event.key === 'Home') {
                  event.preventDefault();
                  moveSelection(0);
                } else if (event.key === 'End') {
                  event.preventDefault();
                  moveSelection(devices.length - 1);
                }
              }}
              role="option"
              aria-selected={selected}
              tabIndex={selected || (selectedDeviceId === null && index === 0) ? 0 : -1}
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
