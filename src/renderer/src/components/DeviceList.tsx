import type { Device, DeviceReachability } from '@shared/types';
import type { Messages } from '../i18n';
import { Avatar } from './Avatar';

interface DeviceListProps {
  devices: Device[];
  selectedDeviceIds: string[];
  retainedDeviceIds?: Set<string>;
  focusedDeviceId: string | null;
  reachabilityByDeviceId?: Record<string, DeviceReachability>;
  trustedDeviceKeys?: Set<string>;
  isRefreshing?: boolean;
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
  retainedDeviceIds,
  focusedDeviceId,
  reachabilityByDeviceId,
  trustedDeviceKeys,
  isRefreshing = false,
  onToggleSelect,
  onFocusDevice,
  onRefresh,
  messages
}: DeviceListProps): JSX.Element {
  if (devices.length === 0) {
    return (
      <div className="device-list-empty">
        <div className="device-list-empty-icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </div>
        <div className="device-list-empty-copy">
          <p className="device-list-empty-title">{messages.noOnlinePeers}</p>
          <p className="device-list-empty-body">{messages.keepRunningOnAnotherDevice}</p>
          <ol className="device-list-empty-steps">
            <li>{messages.deviceListEmptyStepOpen}</li>
            <li>{messages.deviceListEmptyStepLan}</li>
            <li>{messages.deviceListEmptyStepRefresh}</li>
          </ol>
          {onRefresh && (
            <button
              type="button"
              className="button device-list-empty-refresh"
              onClick={() => void onRefresh()}
              disabled={isRefreshing}
              aria-busy={isRefreshing}
            >
              {isRefreshing ? messages.refreshingDevices : messages.refreshDevices}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <ul
      className="device-list"
      role="listbox"
      aria-label={messages.onlineDevicesAriaLabel}
      aria-multiselectable="true"
      aria-busy={isRefreshing}
    >
      {devices.map((device, index) => {
        const selected = selectedDeviceIds.includes(device.deviceId);
        const retained = retainedDeviceIds?.has(device.deviceId) ?? false;
        const trusted = trustedDeviceKeys?.has(`${device.deviceId}:${device.trustFingerprint}`) ?? false;
        const reachability = reachabilityByDeviceId?.[device.deviceId];
        const reachabilityLabel =
          retained
            ? messages.recipientOfflineLabel
            : reachability?.status === 'checking'
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
              className={`device-item${selected ? ' is-selected' : ''}${retained ? ' is-retained' : ''}`}
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
                  onFocusDevice(device.deviceId);
                  onToggleSelect(device.deviceId);
                }
              }}
              role="option"
              aria-selected={selected}
              tabIndex={device.deviceId === (focusedDeviceId ?? devices[0]?.deviceId) ? 0 : -1}
            >
              <span
                className={`device-item-indicator${
                  retained
                    ? ' is-retained'
                    : reachability?.status === 'unreachable'
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
                      retained
                        ? ' is-retained'
                        : reachability?.status === 'unreachable'
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
