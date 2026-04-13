import { useDeferredValue, useMemo, useState } from 'react';
import type { TransferProgress } from '@shared/types';
import type { Messages } from '../i18n';

interface TransferListProps {
  transfers: TransferProgress[];
  messages: Messages;
  onPause: (transferId: string) => void | Promise<void>;
  onCancel: (transferId: string) => void | Promise<void>;
  onRetry: (transferId: string) => void | Promise<void>;
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
  if (status === 'paused') {
    return messages.transferStatusPaused;
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
  if (status === 'cancelled') {
    return messages.transferStatusCancelled;
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

export function TransferList({ transfers, messages, onPause, onCancel, onRetry }: TransferListProps): JSX.Element {
  const [filter, setFilter] = useState<'all' | 'active' | 'done' | 'issues'>('all');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const visibleTransfers = useMemo(
    () =>
      transfers.filter((item) => {
        const matchesFilter =
          filter === 'all' ||
          (filter === 'active' && ['pending', 'in-progress', 'paused'].includes(item.status)) ||
          (filter === 'done' && item.status === 'completed') ||
          (filter === 'issues' && ['failed', 'rejected', 'cancelled'].includes(item.status));

        const matchesQuery =
          normalizedQuery.length === 0 ||
          item.fileName.toLowerCase().includes(normalizedQuery) ||
          item.peerDeviceName.toLowerCase().includes(normalizedQuery);

        return matchesFilter && matchesQuery;
      }),
    [filter, normalizedQuery, transfers]
  );

  if (transfers.length === 0) {
    return (
      <div className="transfer-panel">
        <div className="transfer-list-empty">{messages.transferEmpty}</div>
      </div>
    );
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
    <div className="transfer-panel">
      <div className="transfer-toolbar">
        <div className="transfer-filters">
          {[
            ['all', messages.taskFilterAll],
            ['active', messages.taskFilterActive],
            ['done', messages.taskFilterDone],
            ['issues', messages.taskFilterIssues]
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`transfer-filter${filter === value ? ' is-active' : ''}`}
              onClick={() => setFilter(value as typeof filter)}
            >
              {label}
            </button>
          ))}
        </div>
        {visibleTransfers.some(
          (item) =>
            item.direction === 'send' &&
            ['failed', 'rejected', 'cancelled', 'paused'].includes(item.status) &&
            Boolean(item.localPath) &&
            Boolean(item.peerDeviceId)
        ) && (
          <button
            type="button"
            className="button button-ghost transfer-bulk-action"
            onClick={() => {
              void Promise.all(
                visibleTransfers
                  .filter(
                    (item) =>
                      item.direction === 'send' &&
                      ['failed', 'rejected', 'cancelled', 'paused'].includes(item.status) &&
                      Boolean(item.localPath) &&
                      Boolean(item.peerDeviceId)
                  )
                  .map((item) => onRetry(item.transferId))
              );
            }}
          >
            {messages.taskRetryVisible}
          </button>
        )}
        <input
          type="search"
          className="transfer-search"
          placeholder={messages.taskSearchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {visibleTransfers.length === 0 ? (
        <div className="transfer-list-empty">
          {filter === 'all' && normalizedQuery.length === 0
            ? messages.transferEmpty
            : messages.taskNoMatches}
        </div>
      ) : (
      <ul className="transfer-list">
      {visibleTransfers.map((item) => {
        const percent = progressPercent(item);
        const directionLabel = item.direction === 'send' ? messages.sendTo : messages.receiveFrom;
        const statusText = statusLabel(item.status, messages);
        const receiveModeText = receiveModeLabel(item, messages);
        const canPause = item.direction === 'send' && (item.status === 'pending' || item.status === 'in-progress');
        const canCancel = item.status === 'pending' || item.status === 'in-progress';
        const canRetry =
          item.direction === 'send' &&
          (item.status === 'failed' || item.status === 'rejected' || item.status === 'cancelled' || item.status === 'paused') &&
          Boolean(item.localPath) &&
          Boolean(item.peerDeviceId);
        const expanded = expandedId === item.transferId;
        return (
          <li key={item.transferId} className={`transfer-item is-${item.status}`}>
            <div className="transfer-item-stamp">{statusText}</div>
            <button
              type="button"
              className="transfer-item-top transfer-item-summary"
              onClick={() => setExpandedId(expanded ? null : item.transferId)}
            >
              <div className="transfer-item-title-group">
                <div className="transfer-item-direction">{directionLabel}</div>
                <div className="transfer-item-name">{item.fileName}</div>
              </div>
              <div className="transfer-item-percent">{percent}%</div>
            </button>
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
            {(canPause || canCancel || canRetry || (item.status === 'completed' && item.localPath)) && (
              <div className="transfer-item-actions">
                {canPause && (
                  <button
                    type="button"
                    className="button button-ghost transfer-item-action"
                    onClick={() => void onPause(item.transferId)}
                  >
                    {messages.transferPause}
                  </button>
                )}
                {canCancel && (
                  <button
                    type="button"
                    className="button button-ghost transfer-item-action"
                    onClick={() => void onCancel(item.transferId)}
                  >
                    {messages.transferCancel}
                  </button>
                )}
                {canRetry && (
                  <button
                    type="button"
                    className="button button-ghost transfer-item-action"
                    onClick={() => void onRetry(item.transferId)}
                  >
                    {messages.transferRetry}
                  </button>
                )}
                {item.status === 'completed' && item.localPath && (
                <button
                  type="button"
                  className="button button-ghost transfer-item-action"
                  onClick={() => void handleOpenPath(item.localPath!)}
                >
                  {messages.transferOpenFile}
                </button>
                )}
                {item.status === 'completed' && item.localPath && (
                  <button
                    type="button"
                    className="button button-ghost transfer-item-action"
                    onClick={() => void handleRevealPath(item.localPath!)}
                  >
                    {messages.transferRevealFile}
                  </button>
                )}
              </div>
            )}
            {expanded && (
              <div className="transfer-item-details">
                {item.localPath && (
                  <div className="transfer-item-detail-row">
                    <span className="transfer-item-detail-label">{messages.transferLocalPath}</span>
                    <span className="transfer-item-detail-value">{item.localPath}</span>
                  </div>
                )}
                {item.peerDeviceId && (
                  <div className="transfer-item-detail-row">
                    <span className="transfer-item-detail-label">{messages.transferPeerId}</span>
                    <span className="transfer-item-detail-value">{item.peerDeviceId}</span>
                  </div>
                )}
              </div>
            )}
            {item.error && <div className="transfer-item-error">{item.error}</div>}
          </li>
        );
      })}
      </ul>
      )}
    </div>
  );
}
