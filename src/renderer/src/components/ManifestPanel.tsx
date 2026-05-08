import { DeviceList } from './DeviceList';
import type { Messages } from '../i18n';
import type { Device, DeviceReachability } from '@shared/types';

interface ManifestPanelProps {
  messages: Messages;
  devices: Device[];
  selectedDeviceIds: string[];
  focusedDeviceId: string | null;
  reachabilityByDeviceId: Record<string, DeviceReachability>;
  trustedDeviceKeys: Set<string>;
  reachableDeviceCount: number;
  isRefreshingDevices: boolean;
  onToggleDeviceSelection: (deviceId: string) => void;
  onFocusDevice: (deviceId: string | null) => void;
  onRefreshDevices: () => void | Promise<void>;
}

export function ManifestPanel({
  messages,
  devices,
  selectedDeviceIds,
  focusedDeviceId,
  reachabilityByDeviceId,
  trustedDeviceKeys,
  reachableDeviceCount,
  isRefreshingDevices,
  onToggleDeviceSelection,
  onFocusDevice,
  onRefreshDevices
}: ManifestPanelProps): JSX.Element {
  return (
    <section className="card card-manifest workspace-panel">
      <div className="card-head workspace-panel-head">
        <div className="card-head-copy">
          <span className="workspace-panel-kicker">{messages.manifestKicker}</span>
          <h2>{messages.onlineDevices}</h2>
          <span className="card-head-caption">{reachableDeviceCount}/{devices.length || 0}</span>
        </div>
        <div className="card-head-actions">
          <button
            type="button"
            className={`button button-ghost manifest-refresh-button${isRefreshingDevices ? ' is-spinning' : ''}`}
            onClick={() => void onRefreshDevices()}
            title={messages.refreshDevices}
            aria-label={messages.refreshDevices}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10" />
              <path d="M20.49 15a9 9 0 0 1-14.13 3.36L1 14" />
            </svg>
          </button>
          <span className="card-counter">{devices.length}</span>
        </div>
      </div>
      <DeviceList
        devices={devices}
        selectedDeviceIds={selectedDeviceIds}
        focusedDeviceId={focusedDeviceId}
        reachabilityByDeviceId={reachabilityByDeviceId}
        trustedDeviceKeys={trustedDeviceKeys}
        onToggleSelect={onToggleDeviceSelection}
        onFocusDevice={onFocusDevice}
        onRefresh={onRefreshDevices}
        messages={messages}
      />
    </section>
  );
}
