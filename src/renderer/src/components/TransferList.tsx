import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { TransferProgress } from '@shared/types';
import type { Messages } from '../i18n';

interface TransferListProps {
  transfers: TransferProgress[];
  messages: Messages;
  onPause: (transferId: string) => void | Promise<void>;
  onCancel: (transferId: string) => void | Promise<void>;
  onRetry: (transferId: string) => void | Promise<void>;
  onClearFinished: () => void | Promise<void>;
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

function compactMeta(item: TransferProgress, messages: Messages): string {
  const peerName = item.peerDeviceName || messages.unknownDevice;
  if (item.error) {
    return `${peerName} · ${item.error}`;
  }
  return `${peerName} · ${formatBytes(item.bytesTransferred)} / ${formatBytes(item.fileSize)}`;
}

export function TransferList({
  transfers,
  messages,
  onPause,
  onCancel,
  onRetry,
  onClearFinished
}: TransferListProps): JSX.Element {
  const [filter, setFilter] = useState<'all' | 'active' | 'done' | 'issues'>('all');
  const [query, setQuery] = useState('');
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);
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
  const hasFinishedTransfers = transfers.some(
    (item) => !['pending', 'in-progress', 'paused'].includes(item.status)
  );
  const selectedTransfer =
    transfers.find((item) => item.transferId === selectedTransferId) ?? null;

  useEffect(() => {
    if (selectedTransferId && !selectedTransfer) {
      setSelectedTransferId(null);
    }
  }, [selectedTransfer, selectedTransferId]);

  useEffect(() => {
    if (!selectedTransferId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setSelectedTransferId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTransferId]);

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
        {hasFinishedTransfers && (
          <button
            type="button"
            className="button button-ghost transfer-bulk-action"
            onClick={() => void onClearFinished()}
          >
            {messages.settingsClearTransferHistory}
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
        const isActiveTransfer = item.status === 'in-progress';
        const showExpandedBody = isActiveTransfer;
        return (
          <li
            key={item.transferId}
            className={`transfer-item is-${item.status}${showExpandedBody ? ' is-detailed' : ' is-compact'}`}
          >
            <button
              type="button"
              className="transfer-item-summary"
              onClick={() => setSelectedTransferId(item.transferId)}
              aria-haspopup="dialog"
              aria-label={`${statusText} ${item.fileName}`}
            >
              <div className="transfer-item-summary-main">
                <div className="transfer-item-summary-head">
                  <div className="transfer-item-stamp">{statusText}</div>
                  <div className="transfer-item-direction">{directionLabel}</div>
                  {receiveModeText && <div className="transfer-item-note">{receiveModeText}</div>}
                </div>
                <div className="transfer-item-top">
                  <div className="transfer-item-title-group">
                    <div className="transfer-item-name">{item.fileName}</div>
                    <div className="transfer-item-meta">{compactMeta(item, messages)}</div>
                  </div>
                </div>
              </div>
              <div className="transfer-item-summary-side">
                <div className="transfer-item-percent">{percent}%</div>
                <span className="transfer-item-chevron" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </span>
              </div>
            </button>
            {showExpandedBody && (
              <>
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
              </>
            )}
            {showExpandedBody && item.error && <div className="transfer-item-error">{item.error}</div>}
          </li>
        );
      })}
      </ul>
      )}
      {selectedTransfer && (
        <TransferDetailDialog
          transfer={selectedTransfer}
          messages={messages}
          onClose={() => setSelectedTransferId(null)}
          onPause={onPause}
          onCancel={onCancel}
          onRetry={onRetry}
          onOpenPath={handleOpenPath}
          onRevealPath={handleRevealPath}
        />
      )}
    </div>
  );
}

interface TransferDetailDialogProps {
  transfer: TransferProgress;
  messages: Messages;
  onClose: () => void;
  onPause: (transferId: string) => void | Promise<void>;
  onCancel: (transferId: string) => void | Promise<void>;
  onRetry: (transferId: string) => void | Promise<void>;
  onOpenPath: (path: string) => void | Promise<void>;
  onRevealPath: (path: string) => void | Promise<void>;
}

function TransferDetailDialog({
  transfer,
  messages,
  onClose,
  onPause,
  onCancel,
  onRetry,
  onOpenPath,
  onRevealPath
}: TransferDetailDialogProps): JSX.Element {
  const percent = progressPercent(transfer);
  const directionLabel = transfer.direction === 'send' ? messages.sendTo : messages.receiveFrom;
  const statusText = statusLabel(transfer.status, messages);
  const receiveModeText = receiveModeLabel(transfer, messages);
  const canPause =
    transfer.direction === 'send' && (transfer.status === 'pending' || transfer.status === 'in-progress');
  const canCancel = transfer.status === 'pending' || transfer.status === 'in-progress';
  const canRetry =
    transfer.direction === 'send' &&
    ['failed', 'rejected', 'cancelled', 'paused'].includes(transfer.status) &&
    Boolean(transfer.localPath) &&
    Boolean(transfer.peerDeviceId);

  return (
    <div className="transfer-detail-overlay" role="presentation" onClick={onClose}>
      <div
        className="transfer-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${messages.transferActivity}: ${transfer.fileName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="transfer-detail-header">
          <div className={`transfer-detail-stamp is-${transfer.status}`}>{statusText}</div>
          <button type="button" className="button button-ghost" onClick={onClose}>
            {messages.dismiss}
          </button>
        </div>

        <h3 className="transfer-detail-title">{transfer.fileName}</h3>
        <p className="transfer-detail-subtitle">
          {directionLabel} {transfer.peerDeviceName || messages.unknownDevice}
        </p>
        {receiveModeText && <p className="transfer-detail-note">{receiveModeText}</p>}

        <div className="transfer-detail-progress">
          <div className="transfer-progress-track" aria-hidden="true">
            <div className="transfer-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="transfer-detail-progress-meta">
            <span>
              {formatBytes(transfer.bytesTransferred)} / {formatBytes(transfer.fileSize)}
            </span>
            <span>{percent}%</span>
          </div>
        </div>

        {(canPause || canCancel || canRetry || (transfer.status === 'completed' && transfer.localPath)) && (
          <div className="transfer-detail-actions">
            {canPause && (
              <button
                type="button"
                className="button button-ghost transfer-item-action"
                onClick={() => void onPause(transfer.transferId)}
              >
                {messages.transferPause}
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                className="button button-ghost transfer-item-action"
                onClick={() => void onCancel(transfer.transferId)}
              >
                {messages.transferCancel}
              </button>
            )}
            {canRetry && (
              <button
                type="button"
                className="button button-ghost transfer-item-action"
                onClick={() => void onRetry(transfer.transferId)}
              >
                {messages.transferRetry}
              </button>
            )}
            {transfer.status === 'completed' && transfer.localPath && (
              <button
                type="button"
                className="button button-ghost transfer-item-action"
                onClick={() => void onOpenPath(transfer.localPath!)}
              >
                {messages.transferOpenFile}
              </button>
            )}
            {transfer.status === 'completed' && transfer.localPath && (
              <button
                type="button"
                className="button button-ghost transfer-item-action"
                onClick={() => void onRevealPath(transfer.localPath!)}
              >
                {messages.transferRevealFile}
              </button>
            )}
          </div>
        )}

        {transfer.error && <div className="transfer-detail-error">{transfer.error}</div>}

        <div className="transfer-item-details transfer-detail-details">
          {transfer.localPath && (
            <div className="transfer-item-detail-row">
              <span className="transfer-item-detail-label">{messages.transferLocalPath}</span>
              <span className="transfer-item-detail-value">{transfer.localPath}</span>
            </div>
          )}
          {transfer.peerDeviceId && (
            <div className="transfer-item-detail-row">
              <span className="transfer-item-detail-label">{messages.transferPeerId}</span>
              <span className="transfer-item-detail-value">{transfer.peerDeviceId}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
