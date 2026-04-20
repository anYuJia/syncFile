import type { Device, DeviceReachability } from '@shared/types';
import type { Messages } from '../i18n';
import { Avatar } from './Avatar';

interface DeviceListProps {
  devices: Device[];
  selectedDeviceIds: string[];
  focusedDeviceId: string | null;
  reachabilityByDeviceId?: Record<string, DeviceReachability>;
  trustedDeviceKeys?: Set<string>;
  onToggleSelect: (deviceId: string) => void;
  onFocusDevice: (deviceId: string) => void;
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
  selectedDeviceIds,
  focusedDeviceId,
  reachabilityByDeviceId,
  trustedDeviceKeys,
  onToggleSelect,
  onFocusDevice,
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
    <ul className="device-list" role="listbox" aria-label={messages.onlineDevicesAriaLabel} aria-multiselectable="true">
      {devices.map((device, index) => {
        const selected = selectedDeviceIds.includes(device.deviceId);
        const trusted = trustedDeviceKeys?.has(`${device.deviceId}:${device.trustFingerprint}`) ?? false;
        const reachability = reachabilityByDeviceId?.[device.deviceId];
        const reachabilityLabel =
          reachability?.status === 'checking'
            ? messages.deviceReachabilityChecking
            : reachability?.status === 'unreachable'
              ? messages.deviceReachabilityUnreachable
              : messages.deviceReachabilityReachable;
        const optionId = `device-option-${device.deviceId}`;
        const moveFocus = (targetIndex: number): void => {
          const nextDevice = devices[targetIndex];
          if (!nextDevice) {
            return;
          }
          onFocusDevice(nextDevice.deviceId);
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
              onClick={() => {
                onFocusDevice(device.deviceId);
                onToggleSelect(device.deviceId);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  moveFocus(Math.min(devices.length - 1, index + 1));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  moveFocus(Math.max(0, index - 1));
                } else if (event.key === 'Home') {
                  event.preventDefault();
                  moveFocus(0);
                } else if (event.key === 'End') {
                  event.preventDefault();
                  moveFocus(devices.length - 1);
                } else if (event.key === ' ' || event.key === 'Enter') {
                  event.preventDefault();
                  onToggleSelect(device.deviceId);
                }
              }}
              role="option"
              aria-selected={selected}
              tabIndex={device.deviceId === (focusedDeviceId ?? devices[0]?.deviceId) ? 0 : -1}
            >
              <span
                className={`device-item-indicator${
                  reachability?.status === 'unreachable'
                    ? ' is-error'
                    : reachability?.status === 'checking'
                      ? ' is-checking'
                      : ''
                }`}
              />
              <Avatar name={device.name} avatarDataUrl={device.avatarDataUrl} size="md" />

              <span className="device-item-main">
                <span className="device-item-row device-item-head">
                  <span className="device-item-title">
                    <span className="device-item-name">{device.name}</span>
                    {trusted && <span className="device-item-trusted">{messages.trustedDeviceLabel}</span>}
                    {selected && <span className="device-item-selected-tag">{messages.selectedRecipientLabel}</span>}
                  </span>
                  <span
                    className={`device-item-reachability${
                      reachability?.status === 'unreachable'
                        ? ' is-error'
                        : reachability?.status === 'checking'
                          ? ' is-checking'
                          : ''
                    }`}
                  >
                    {reachabilityLabel}
                  </span>
                </span>
                <span className="device-item-meta device-item-meta-line">
                  <span className="device-item-platform">{formatPlatform(device.platform)}</span>
                  <span className="device-item-address">{device.address}:{device.port}</span>
                </span>
                <span className="device-item-submeta">
                  {messages.deviceFingerprintLabel} {device.trustFingerprint.slice(0, 13)} · v{device.version}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
