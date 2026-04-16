import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { TransferProgress } from '@shared/types';
import type { Messages } from '../i18n';
import type { RendererTransferProgress } from '../hooks/useSyncFile';
import { formatBytes, formatEta, formatTransferRate } from '../utils/format';

interface TransferListProps {
  transfers: RendererTransferProgress[];
  messages: Messages;
  onPause: (transferId: string) => void | Promise<void>;
  onCancel: (transferId: string) => void | Promise<void>;
  onRetry: (transferId: string) => void | Promise<void>;
  onClearTransfers: (transferIds: string[]) => void | Promise<void>;
  busyTransferIds?: Set<string>;
  selectedTransferId: string | null;
  onSelectedTransferIdChange: (transferId: string | null) => void;
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

function compactMeta(item: RendererTransferProgress, messages: Messages): string {
  const peerName = item.peerDeviceName || messages.unknownDevice;
  if (item.error) {
    return `${peerName} · ${item.error}`;
  }
  if (item.direction === 'send' && item.status === 'pending' && item.bytesTransferred === 0) {
    return `${peerName} · ${messages.transferPreparing}`;
  }
  return `${peerName} · ${formatBytes(item.bytesTransferred)} / ${formatBytes(item.fileSize)}`;
}

function canOpenCompletedReceive(item: RendererTransferProgress): boolean {
  return item.direction === 'receive' && item.status === 'completed' && Boolean(item.localPath);
}

function canDeleteTransfer(item: RendererTransferProgress): boolean {
  return !['pending', 'in-progress', 'paused'].includes(item.status);
}

export function TransferList({
  transfers,
  messages,
  onPause,
  onCancel,
  onRetry,
  onClearTransfers,
  busyTransferIds,
  selectedTransferId,
  onSelectedTransferIdChange
}: TransferListProps): JSX.Element {
  const [filter, setFilter] = useState<'all' | 'active' | 'done' | 'issues'>('all');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'send' | 'receive'>('all');
  const [peerFilter, setPeerFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const peerOptions = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const transfer of transfers) {
      const key = transfer.peerDeviceId || transfer.peerDeviceName || 'unknown';
      const current = counts.get(key);
      counts.set(key, {
        label: transfer.peerDeviceName || messages.unknownDevice,
        count: (current?.count ?? 0) + 1
      });
    }

    return [...counts.entries()]
      .sort((left, right) => right[1].count - left[1].count || left[1].label.localeCompare(right[1].label))
      .slice(0, 8);
  }, [messages.unknownDevice, transfers]);
  const visibleTransfers = useMemo(
    () =>
      transfers.filter((item) => {
        const matchesFilter =
          filter === 'all' ||
          (filter === 'active' && ['pending', 'in-progress', 'paused'].includes(item.status)) ||
          (filter === 'done' && item.status === 'completed') ||
          (filter === 'issues' && ['failed', 'rejected', 'cancelled'].includes(item.status));
        const matchesDirection = directionFilter === 'all' || item.direction === directionFilter;
        const peerKey = item.peerDeviceId || item.peerDeviceName || 'unknown';
        const matchesPeer = peerFilter === 'all' || peerKey === peerFilter;

        const matchesQuery =
          normalizedQuery.length === 0 ||
          item.fileName.toLowerCase().includes(normalizedQuery) ||
          item.peerDeviceName.toLowerCase().includes(normalizedQuery);

        return matchesFilter && matchesDirection && matchesPeer && matchesQuery;
      }),
    [directionFilter, filter, normalizedQuery, peerFilter, transfers]
  );
  const selectedTransfer =
    transfers.find((item) => item.transferId === selectedTransferId) ?? null;

  useEffect(() => {
    if (selectedTransferId && !selectedTransfer) {
      onSelectedTransferIdChange(null);
    }
  }, [onSelectedTransferIdChange, selectedTransfer, selectedTransferId]);

  useEffect(() => {
    if (!selectedTransferId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onSelectedTransferIdChange(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSelectedTransferIdChange, selectedTransferId]);

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

  const finishedTransferIds = transfers
    .filter((item) => canDeleteTransfer(item))
    .map((item) => item.transferId);

  return (
    <div className="transfer-panel">
      <div className="transfer-toolbar">
        <div className="transfer-toolbar-groups">
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
          <div className="transfer-direction-filters">
            {[
              ['all', messages.taskDirectionAll],
              ['send', messages.taskDirectionSend],
              ['receive', messages.taskDirectionReceive]
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`transfer-filter${directionFilter === value ? ' is-active' : ''}`}
                onClick={() => setDirectionFilter(value as typeof directionFilter)}
              >
                {label}
              </button>
            ))}
          </div>
          {peerOptions.length > 1 && (
            <div className="transfer-direction-filters">
              <button
                type="button"
                className={`transfer-filter${peerFilter === 'all' ? ' is-active' : ''}`}
                onClick={() => setPeerFilter('all')}
              >
                {messages.taskPeerAll}
              </button>
              {peerOptions.map(([value, peer]) => (
                <button
                  key={value}
                  type="button"
                  className={`transfer-filter${peerFilter === value ? ' is-active' : ''}`}
                  onClick={() => setPeerFilter(value)}
                  title={peer.label}
                >
                  {peer.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {visibleTransfers.some(
          (item) => ['pending', 'in-progress'].includes(item.status)
        ) && (
          <button
            type="button"
            className="button button-ghost transfer-bulk-action"
            onClick={() => {
              void Promise.all(
                visibleTransfers
                  .filter((item) => ['pending', 'in-progress'].includes(item.status))
                  .map((item) => onCancel(item.transferId))
              );
            }}
          >
            {messages.taskCancelVisible}
          </button>
        )}
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
        {finishedTransferIds.length > 0 && (
          <button
            type="button"
            className="button button-ghost transfer-bulk-action"
            onClick={() => void onClearTransfers(finishedTransferIds)}
          >
            {messages.transferClearAll}
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
        const canDelete = canDeleteTransfer(item);
        const canRetry =
          item.direction === 'send' &&
          (item.status === 'failed' || item.status === 'rejected' || item.status === 'cancelled' || item.status === 'paused') &&
          Boolean(item.localPath) &&
          Boolean(item.peerDeviceId);
        const canOpenPath = canOpenCompletedReceive(item);
        const isBusy = busyTransferIds?.has(item.transferId) ?? false;
        const isActiveTransfer = item.status === 'in-progress';
        const showExpandedBody =
          isActiveTransfer ||
          item.status === 'paused' ||
          canRetry ||
          canOpenPath ||
          Boolean(item.error);
        return (
          <li
            key={item.transferId}
            className={`transfer-item is-${item.status}${showExpandedBody ? ' is-detailed' : ' is-compact'}`}
          >
            <div className="transfer-item-summary-row">
              <button
                type="button"
                className="transfer-item-summary"
                onClick={() => onSelectedTransferIdChange(item.transferId)}
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
              {canDelete && (
                <button
                  type="button"
                  className="button button-ghost transfer-item-delete"
                  onClick={() => {
                    if (selectedTransferId === item.transferId) {
                      onSelectedTransferIdChange(null);
                    }
                    void onClearTransfers([item.transferId]);
                  }}
                  aria-label={`${messages.transferDelete} ${item.fileName}`}
                  title={messages.transferDelete}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
              )}
            </div>
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
                {(item.transferRateBytesPerSecond || item.estimatedSecondsRemaining) && (
                  <div className="transfer-item-metrics">
                    {item.transferRateBytesPerSecond && (
                      <span>
                        {messages.transferRateLabel} {formatTransferRate(item.transferRateBytesPerSecond)}
                      </span>
                    )}
                    {item.estimatedSecondsRemaining && (
                      <span>
                        {messages.transferEtaLabel} {formatEta(item.estimatedSecondsRemaining)}
                      </span>
                    )}
                  </div>
                )}
                {(canPause || canCancel || canRetry || canOpenPath) && (
                  <div className="transfer-item-actions">
                    {canPause && (
                      <button
                        type="button"
                        className="button button-ghost transfer-item-action"
                        onClick={() => void onPause(item.transferId)}
                        disabled={isBusy}
                      >
                        {messages.transferPause}
                      </button>
                    )}
                    {canCancel && (
                      <button
                        type="button"
                        className="button button-ghost transfer-item-action"
                        onClick={() => void onCancel(item.transferId)}
                        disabled={isBusy}
                      >
                        {messages.transferCancel}
                      </button>
                    )}
                    {canRetry && (
                      <button
                        type="button"
                        className="button button-ghost transfer-item-action"
                        onClick={() => void onRetry(item.transferId)}
                        disabled={isBusy}
                      >
                        {messages.transferRetry}
                      </button>
                    )}
                    {canOpenPath && (
                      <button
                        type="button"
                        className="button button-ghost transfer-item-action"
                        onClick={() => void handleOpenPath(item.localPath!)}
                      >
                        {messages.transferOpenFile}
                      </button>
                    )}
                    {canOpenPath && (
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
          onClose={() => onSelectedTransferIdChange(null)}
          onClearTransfers={onClearTransfers}
          onPause={onPause}
          onCancel={onCancel}
          onRetry={onRetry}
          onOpenPath={handleOpenPath}
          onRevealPath={handleRevealPath}
          busyTransferIds={busyTransferIds}
        />
      )}
    </div>
  );
}

interface TransferDetailDialogProps {
  transfer: RendererTransferProgress;
  messages: Messages;
  onClose: () => void;
  onClearTransfers: (transferIds: string[]) => void | Promise<void>;
  onPause: (transferId: string) => void | Promise<void>;
  onCancel: (transferId: string) => void | Promise<void>;
  onRetry: (transferId: string) => void | Promise<void>;
  onOpenPath: (path: string) => void | Promise<void>;
  onRevealPath: (path: string) => void | Promise<void>;
  busyTransferIds?: Set<string>;
}

function TransferDetailDialog({
  transfer,
  messages,
  onClose,
  onClearTransfers,
  onPause,
  onCancel,
  onRetry,
  onOpenPath,
  onRevealPath,
  busyTransferIds
}: TransferDetailDialogProps): JSX.Element {
  const percent = progressPercent(transfer);
  const directionLabel = transfer.direction === 'send' ? messages.sendTo : messages.receiveFrom;
  const statusText = statusLabel(transfer.status, messages);
  const receiveModeText = receiveModeLabel(transfer, messages);
  const canPause =
    transfer.direction === 'send' && (transfer.status === 'pending' || transfer.status === 'in-progress');
  const canCancel = transfer.status === 'pending' || transfer.status === 'in-progress';
  const canDelete = canDeleteTransfer(transfer);
  const canRetry =
    transfer.direction === 'send' &&
    ['failed', 'rejected', 'cancelled', 'paused'].includes(transfer.status) &&
    Boolean(transfer.localPath) &&
    Boolean(transfer.peerDeviceId);
  const canOpenPath = canOpenCompletedReceive(transfer);
  const isBusy = busyTransferIds?.has(transfer.transferId) ?? false;

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
        {(transfer.transferRateBytesPerSecond || transfer.estimatedSecondsRemaining) && (
          <div className="transfer-detail-metrics">
            {transfer.transferRateBytesPerSecond && (
              <span>
                {messages.transferRateLabel} {formatTransferRate(transfer.transferRateBytesPerSecond)}
              </span>
            )}
            {transfer.estimatedSecondsRemaining && (
              <span>
                {messages.transferEtaLabel} {formatEta(transfer.estimatedSecondsRemaining)}
              </span>
            )}
          </div>
        )}

        {(canPause || canCancel || canRetry || canOpenPath || canDelete) && (
          <div className="transfer-detail-actions">
            {canPause && (
              <button
                type="button"
                className="button button-ghost transfer-item-action"
                onClick={() => void onPause(transfer.transferId)}
                disabled={isBusy}
              >
                {messages.transferPause}
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                className="button button-ghost transfer-item-action"
                onClick={() => void onCancel(transfer.transferId)}
                disabled={isBusy}
              >
                {messages.transferCancel}
              </button>
            )}
            {canRetry && (
              <button
                type="button"
                className="button button-ghost transfer-item-action"
                onClick={() => void onRetry(transfer.transferId)}
                disabled={isBusy}
              >
                {messages.transferRetry}
              </button>
            )}
            {canOpenPath && (
              <button
                type="button"
                className="button button-ghost transfer-item-action"
                onClick={() => void onOpenPath(transfer.localPath!)}
              >
                {messages.transferOpenFile}
              </button>
            )}
            {canOpenPath && (
              <button
                type="button"
                className="button button-ghost transfer-item-action"
                onClick={() => void onRevealPath(transfer.localPath!)}
              >
                {messages.transferRevealFile}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className="button button-ghost transfer-item-action"
                onClick={() => {
                  void onClearTransfers([transfer.transferId]);
                  onClose();
                }}
              >
                {messages.transferDelete}
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
