import { RefreshCw } from 'lucide-react';

import { DeviceList } from './DeviceList';
import type { Messages } from '../i18n';
import type { Device, DeviceReachability } from '@shared/types';

interface ManifestPanelProps {
  messages: Messages;
  devices: Device[];
  selectedDeviceIds: string[];
  retainedDeviceIds: Set<string>;
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
  retainedDeviceIds,
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
            disabled={isRefreshingDevices}
            aria-busy={isRefreshingDevices}
            title={messages.refreshDevices}
            aria-label={messages.refreshDevices}
          >
            <RefreshCw aria-hidden="true" />
          </button>
          <span
            className="card-counter"
            aria-label={isRefreshingDevices ? messages.refreshingDevices : undefined}
            aria-live="polite"
          >
            {devices.length}
          </span>
        </div>
      </div>
      <DeviceList
        devices={devices}
        selectedDeviceIds={selectedDeviceIds}
        retainedDeviceIds={retainedDeviceIds}
        focusedDeviceId={focusedDeviceId}
        reachabilityByDeviceId={reachabilityByDeviceId}
        trustedDeviceKeys={trustedDeviceKeys}
        isRefreshing={isRefreshingDevices}
        onToggleSelect={onToggleDeviceSelection}
        onFocusDevice={onFocusDevice}
        onRefresh={onRefreshDevices}
        messages={messages}
      />
    </section>
  );
}
