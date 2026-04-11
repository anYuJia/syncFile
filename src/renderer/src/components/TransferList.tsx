import type { TransferProgress } from '@shared/types';
import type { Messages } from '../i18n';

interface TransferListProps {
  transfers: TransferProgress[];
  messages: Messages;
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

function statusLabel(status: TransferProgress['status'], messages: Messages): string {
  if (status === 'in-progress') {
    return messages.transferStatusInProgress;
  }
  if (status === 'completed') {
    return messages.transferStatusCompleted;
  }
  if (status === 'failed') {
    return messages.transferStatusFailed;
  }
  if (status === 'rejected') {
    return messages.transferStatusRejected;
  }
  return messages.transferStatusPending;
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

function receiveModeLabel(item: TransferProgress, messages: Messages): string | null {
  if (item.direction !== 'receive') {
    return null;
  }
  if (item.receiveMode === 'trusted-device') {
    return messages.transferReceiveModeTrusted;
  }
  if (item.receiveMode === 'auto-accept') {
    return messages.transferReceiveModeAuto;
  }
  return null;
}

export function TransferList({ transfers, messages }: TransferListProps): JSX.Element {
  if (transfers.length === 0) {
    return <div className="transfer-list-empty">{messages.transferEmpty}</div>;
  }

  const handleOpenPath = async (path: string): Promise<void> => {
    try {
      await window.syncFile.openTransferPath(path);
    } catch {
      // Transfer list is best-effort only.
    }
  };

  const handleRevealPath = async (path: string): Promise<void> => {
    try {
      await window.syncFile.revealTransferPath(path);
    } catch {
      // Transfer list is best-effort only.
    }
  };

  return (
    <ul className="transfer-list">
      {transfers.map((item) => {
        const percent = progressPercent(item);
        const directionLabel = item.direction === 'send' ? messages.sendTo : messages.receiveFrom;
        const statusText = statusLabel(item.status, messages);
        const receiveModeText = receiveModeLabel(item, messages);
        return (
          <li key={item.transferId} className={`transfer-item is-${item.status}`}>
            <div className="transfer-item-stamp">{statusText}</div>
            <div className="transfer-item-top">
              <div className="transfer-item-title-group">
                <div className="transfer-item-direction">{directionLabel}</div>
                <div className="transfer-item-name">{item.fileName}</div>
              </div>
              <div className="transfer-item-percent">{percent}%</div>
            </div>
            <div className="transfer-item-meta">
              {directionLabel} {item.peerDeviceName || messages.unknownDevice}
            </div>
            {receiveModeText && <div className="transfer-item-note">{receiveModeText}</div>}
            <div className="transfer-progress-track" aria-hidden="true">
              <div className="transfer-progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <div className="transfer-item-foot">
              <span>
                {formatBytes(item.bytesTransferred)} / {formatBytes(item.fileSize)}
              </span>
              <span>{item.peerDeviceName || messages.unknownDevice}</span>
            </div>
            {item.status === 'completed' && item.localPath && (
              <div className="transfer-item-actions">
                <button
                  type="button"
                  className="button button-ghost transfer-item-action"
                  onClick={() => void handleOpenPath(item.localPath!)}
                >
                  {messages.transferOpenFile}
                </button>
                <button
                  type="button"
                  className="button button-ghost transfer-item-action"
                  onClick={() => void handleRevealPath(item.localPath!)}
                >
                  {messages.transferRevealFile}
                </button>
              </div>
            )}
            {item.error && <div className="transfer-item-error">{item.error}</div>}
          </li>
        );
      })}
    </ul>
  );
}
