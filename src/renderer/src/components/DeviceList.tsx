import type { Device } from '@shared/types';

interface DeviceListProps {
  devices: Device[];
  selectedDeviceId: string | null;
  onSelect: (deviceId: string) => void;
}

export function DeviceList({ devices, selectedDeviceId, onSelect }: DeviceListProps): JSX.Element {
  if (devices.length === 0) {
    return (
      <div className="device-list-empty">
        <p className="device-list-empty-title">No online peers</p>
        <p className="device-list-empty-body">Keep syncFile running on another device in this LAN.</p>
      </div>
    );
  }

  return (
    <ul className="device-list" role="listbox" aria-label="Online devices">
      {devices.map((device) => {
        const selected = device.deviceId === selectedDeviceId;
        return (
          <li key={device.deviceId}>
            <button
              type="button"
              className={`device-item${selected ? ' is-selected' : ''}`}
              onClick={() => onSelect(device.deviceId)}
              role="option"
              aria-selected={selected}
            >
              <span className="device-item-name">{device.name}</span>
              <span className="device-item-meta">
                {device.address}:{device.port}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
