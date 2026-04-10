import type { TransferProgress } from '@shared/types';

interface TransferListProps {
  transfers: TransferProgress[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function statusLabel(status: TransferProgress['status']): string {
  if (status === 'in-progress') {
    return 'In progress';
  }
  if (status === 'completed') {
    return 'Completed';
  }
  if (status === 'failed') {
    return 'Failed';
  }
  if (status === 'rejected') {
    return 'Rejected';
  }
  return 'Pending';
}

function progressPercent(item: TransferProgress): number {
  if (item.status === 'completed') {
    return 100;
  }
  if (item.fileSize <= 0) {
    return 0;
  }
  const raw = Math.round((item.bytesTransferred / item.fileSize) * 100);
  return Math.min(100, Math.max(0, raw));
}

export function TransferList({ transfers }: TransferListProps): JSX.Element {
  if (transfers.length === 0) {
    return <div className="transfer-list-empty">No transfer records yet.</div>;
  }

  return (
    <ul className="transfer-list">
      {transfers.map((item) => {
        const percent = progressPercent(item);
        const directionLabel = item.direction === 'send' ? 'Send to' : 'Receive from';
        return (
          <li key={item.transferId} className={`transfer-item is-${item.status}`}>
            <div className="transfer-item-top">
              <div className="transfer-item-name">{item.fileName}</div>
              <div className="transfer-item-status">{statusLabel(item.status)}</div>
            </div>
            <div className="transfer-item-meta">
              {directionLabel} {item.peerDeviceName || 'unknown'}
            </div>
            <div className="transfer-progress-track" aria-hidden="true">
              <div className="transfer-progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <div className="transfer-item-foot">
              <span>{percent}%</span>
              <span>
                {formatBytes(item.bytesTransferred)} / {formatBytes(item.fileSize)}
              </span>
            </div>
            {item.error && <div className="transfer-item-error">{item.error}</div>}
          </li>
        );
      })}
    </ul>
  );
}
