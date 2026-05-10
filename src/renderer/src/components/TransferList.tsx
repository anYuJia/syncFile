import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Inbox, Trash2 } from 'lucide-react';
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

function hasLiveMetrics(item: RendererTransferProgress): boolean {
  return item.status === 'in-progress' && !isWaitingForReceiverConfirmation(item);
}

function isWaitingForReceiverConfirmation(item: RendererTransferProgress): boolean {
  return item.direction === 'send' && item.status === 'in-progress' && item.fileSize > 0 && item.bytesTransferred >= item.fileSize;
}

function liveMetricSummary(item: RendererTransferProgress, messages: Messages): string | null {
  if (item.status === 'pending') {
    return messages.transferPreparing;
  }
  if (item.status !== 'in-progress') {
    return null;
  }
  if (isWaitingForReceiverConfirmation(item)) {
    return messages.transferWaitingForReceiver;
  }

  const parts: string[] = [];
  parts.push(item.transferRateBytesPerSecond ? formatTransferRate(item.transferRateBytesPerSecond) : '--/s');
  if (item.estimatedSecondsRemaining) {
    parts.push(`${messages.transferEtaLabel} ${formatEta(item.estimatedSecondsRemaining)}`);
  } else if (item.status === 'in-progress' && item.fileSize > item.bytesTransferred) {
    parts.push(`${messages.transferEtaLabel} --`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
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
  const [bulkAction, setBulkAction] = useState<'cancel' | 'resume' | 'retry' | 'clear' | null>(null);
  const [confirmingAction, setConfirmingAction] = useState<string | null>(null);
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
          (item.peerDeviceName || messages.unknownDevice).toLowerCase().includes(normalizedQuery);

        return matchesFilter && matchesDirection && matchesPeer && matchesQuery;
      }),
    [directionFilter, filter, messages.unknownDevice, normalizedQuery, peerFilter, transfers]
  );
  const selectedTransfer =
    transfers.find((item) => item.transferId === selectedTransferId) ?? null;
  const hasActiveFilters =
    filter !== 'all' ||
    directionFilter !== 'all' ||
    peerFilter !== 'all' ||
    query.trim().length > 0;
  const groupedVisibleTransfers = useMemo(() => {
    const groups: Array<{ key: string; batchLabel?: string; transfers: RendererTransferProgress[] }> = [];
    const groupIndexByKey = new Map<string, number>();
    for (const item of visibleTransfers) {
      const key = item.batchId ?? item.transferId;
      const existingIndex = groupIndexByKey.get(key);
      if (existingIndex !== undefined) {
        groups[existingIndex].transfers.push(item);
        continue;
      }
      groups.push({
        key,
        batchLabel: item.batchLabel,
        transfers: [item]
      });
      groupIndexByKey.set(key, groups.length - 1);
    }
    return groups;
  }, [visibleTransfers]);

  useEffect(() => {
    if (selectedTransferId && !selectedTransfer) {
      onSelectedTransferIdChange(null);
    }
  }, [onSelectedTransferIdChange, selectedTransfer, selectedTransferId]);

  useEffect(() => {
    if (peerFilter === 'all') {
      return;
    }
    if (!peerOptions.some(([value]) => value === peerFilter)) {
      setPeerFilter('all');
    }
  }, [peerFilter, peerOptions]);

  useEffect(() => {
    if (!selectedTransferId) {
      return;
    }
    if (!visibleTransfers.some((item) => item.transferId === selectedTransferId)) {
      onSelectedTransferIdChange(null);
    }
  }, [onSelectedTransferIdChange, selectedTransferId, visibleTransfers]);

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

  useEffect(() => {
    if (!confirmingAction) {
      return;
    }
    const timer = window.setTimeout(() => setConfirmingAction(null), 3600);
    return () => window.clearTimeout(timer);
  }, [confirmingAction]);

  if (transfers.length === 0) {
    return (
      <div className="transfer-panel">
        <div className="transfer-list-empty">
          <span className="transfer-list-empty-mark" aria-hidden="true">
            <Inbox />
          </span>
          <span className="transfer-list-empty-title">{messages.transferEmpty}</span>
          <span className="transfer-list-empty-copy">{messages.ledgerNote}</span>
        </div>
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

  const finishedVisibleTransferIds = visibleTransfers
    .filter((item) => canDeleteTransfer(item))
    .map((item) => item.transferId);
  const cancellableVisibleTransferIds = visibleTransfers
    .filter(
      (item) =>
        ['pending', 'in-progress'].includes(item.status) ||
        (item.direction === 'send' && item.status === 'paused')
    )
    .map((item) => item.transferId);
  const resumableVisibleTransferIds = visibleTransfers
    .filter(
      (item) =>
        item.direction === 'send' &&
        item.status === 'paused' &&
        Boolean(item.localPath) &&
        Boolean(item.peerDeviceId)
    )
    .map((item) => item.transferId);
  const retryableVisibleTransferIds = visibleTransfers
    .filter(
      (item) =>
        item.direction === 'send' &&
        ['failed', 'rejected', 'cancelled'].includes(item.status) &&
        Boolean(item.localPath) &&
        Boolean(item.peerDeviceId)
    )
    .map((item) => item.transferId);
  const isBulkBusy = bulkAction !== null;

  const runBulkAction = async (
    action: NonNullable<typeof bulkAction>,
    transferIds: string[],
    handler: (transferId: string) => void | Promise<void>
  ): Promise<void> => {
    if (transferIds.length === 0 || isBulkBusy) {
      return;
    }

    try {
      setBulkAction(action);
      setConfirmingAction(null);
      await Promise.allSettled(transferIds.map((transferId) => handler(transferId)));
    } finally {
      setBulkAction(null);
    }
  };

  const handleFilterChange = (nextFilter: typeof filter): void => {
    if (isBulkBusy) {
      return;
    }
    setFilter(nextFilter);
    setConfirmingAction(null);
  };

  const handleDirectionFilterChange = (nextDirectionFilter: typeof directionFilter): void => {
    if (isBulkBusy) {
      return;
    }
    setDirectionFilter(nextDirectionFilter);
    setConfirmingAction(null);
  };

  const handlePeerFilterChange = (nextPeerFilter: string): void => {
    if (isBulkBusy) {
      return;
    }
    setPeerFilter(nextPeerFilter);
    setConfirmingAction(null);
  };

  const handleBulkCancel = async (): Promise<void> => {
    if (cancellableVisibleTransferIds.length === 0 || isBulkBusy) {
      return;
    }
    if (confirmingAction !== 'bulk-cancel') {
      setConfirmingAction('bulk-cancel');
      return;
    }
    await runBulkAction('cancel', cancellableVisibleTransferIds, onCancel);
  };

  const handleBulkClear = async (): Promise<void> => {
    if (finishedVisibleTransferIds.length === 0 || isBulkBusy) {
      return;
    }
    if (confirmingAction !== 'bulk-clear') {
      setConfirmingAction('bulk-clear');
      return;
    }

    try {
      setBulkAction('clear');
      setConfirmingAction(null);
      await onClearTransfers(finishedVisibleTransferIds);
    } finally {
      setBulkAction(null);
    }
  };

  const handleDeleteTransfer = async (transferId: string): Promise<void> => {
    if (isBulkBusy || busyTransferIds?.has(transferId)) {
      return;
    }
    const actionKey = `delete:${transferId}`;
    if (confirmingAction !== actionKey) {
      setConfirmingAction(actionKey);
      return;
    }
    setConfirmingAction(null);
    if (selectedTransferId === transferId) {
      onSelectedTransferIdChange(null);
    }
    await onClearTransfers([transferId]);
  };

  const resetFilters = (): void => {
    setFilter('all');
    setDirectionFilter('all');
    setPeerFilter('all');
    setQuery('');
    setConfirmingAction(null);
  };

  const toggleTransferDetails = (transferId: string): void => {
    onSelectedTransferIdChange(selectedTransferId === transferId ? null : transferId);
  };

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
                onClick={() => handleFilterChange(value as typeof filter)}
                disabled={isBulkBusy}
                aria-pressed={filter === value}
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
                onClick={() => handleDirectionFilterChange(value as typeof directionFilter)}
                disabled={isBulkBusy}
                aria-pressed={directionFilter === value}
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
                onClick={() => handlePeerFilterChange('all')}
                disabled={isBulkBusy}
                aria-pressed={peerFilter === 'all'}
              >
                {messages.taskPeerAll}
              </button>
              {peerOptions.map(([value, peer]) => (
                <button
                  key={value}
                  type="button"
                  className={`transfer-filter${peerFilter === value ? ' is-active' : ''}`}
                  onClick={() => handlePeerFilterChange(value)}
                  disabled={isBulkBusy}
                  title={peer.label}
                  aria-pressed={peerFilter === value}
                >
                  {peer.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {cancellableVisibleTransferIds.length > 0 && (
          <button
            type="button"
            className={`button button-ghost transfer-bulk-action${confirmingAction === 'bulk-cancel' ? ' is-danger-confirm' : ''}`}
            onClick={() => void handleBulkCancel()}
            disabled={isBulkBusy}
            aria-busy={bulkAction === 'cancel'}
          >
            {confirmingAction === 'bulk-cancel'
              ? messages.taskCancelVisibleConfirm
              : messages.taskCancelVisible}
          </button>
        )}
        {resumableVisibleTransferIds.length > 0 && (
          <button
            type="button"
            className="button button-ghost transfer-bulk-action"
            onClick={() => {
              setConfirmingAction(null);
              void runBulkAction('resume', resumableVisibleTransferIds, onRetry);
            }}
            disabled={isBulkBusy}
            aria-busy={bulkAction === 'resume'}
          >
            {messages.taskResumeVisible}
          </button>
        )}
        {retryableVisibleTransferIds.length > 0 && (
          <button
            type="button"
            className="button button-ghost transfer-bulk-action"
            onClick={() => {
              setConfirmingAction(null);
              void runBulkAction('retry', retryableVisibleTransferIds, onRetry);
            }}
            disabled={isBulkBusy}
            aria-busy={bulkAction === 'retry'}
          >
            {messages.taskRetryVisible}
          </button>
        )}
        {finishedVisibleTransferIds.length > 0 && (
          <button
            type="button"
            className={`button button-ghost transfer-bulk-action${confirmingAction === 'bulk-clear' ? ' is-danger-confirm' : ''}`}
            onClick={() => void handleBulkClear()}
            disabled={isBulkBusy}
            aria-busy={bulkAction === 'clear'}
          >
            {confirmingAction === 'bulk-clear'
              ? messages.taskClearVisibleConfirm
              : messages.taskClearVisible}
          </button>
        )}
        <input
          type="search"
          className="transfer-search"
          placeholder={messages.taskSearchPlaceholder}
          aria-label={messages.taskSearchPlaceholder}
          value={query}
          onChange={(event) => {
            if (isBulkBusy) {
              return;
            }
            setQuery(event.target.value);
            setConfirmingAction(null);
          }}
          disabled={isBulkBusy}
        />
      </div>

      {visibleTransfers.length === 0 ? (
        <div className="transfer-list-empty">
          <span className="transfer-list-empty-mark" aria-hidden="true">
            <Inbox />
          </span>
          <span className="transfer-list-empty-title">
            {filter === 'all' && normalizedQuery.length === 0
              ? messages.transferEmpty
              : messages.taskNoMatches}
          </span>
          <span className="transfer-list-empty-copy">
            {hasActiveFilters ? messages.taskNoMatchesHint : messages.ledgerNote}
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              className="button button-ghost transfer-list-empty-action"
              onClick={resetFilters}
              disabled={isBulkBusy}
            >
              {messages.taskResetFilters}
            </button>
          )}
        </div>
      ) : (
        <ul className="transfer-list">
          {groupedVisibleTransfers.map((group) => (
            <li key={group.key} className="transfer-group">
              {group.transfers[0]?.batchId && group.transfers.length > 1 && (
                <div className="transfer-group-head">
                  <span className="transfer-group-title">{group.batchLabel ?? messages.transferBatchFallback}</span>
                  <span className="transfer-group-count">{group.transfers.length}</span>
                </div>
              )}
              <ul className="transfer-group-list">
                {group.transfers.map((item) => {
                  const percent = progressPercent(item);
                  const directionLabel = item.direction === 'send' ? messages.sendTo : messages.receiveFrom;
                  const isWaitingForReceiver = isWaitingForReceiverConfirmation(item);
                  const statusText = isWaitingForReceiver
                    ? messages.transferWaitingForReceiver
                    : statusLabel(item.status, messages);
                  const receiveModeText = receiveModeLabel(item, messages);
                  const canPause =
                    item.direction === 'send' &&
                    !isWaitingForReceiver &&
                    (item.status === 'pending' || item.status === 'in-progress');
                  const canCancel =
                    item.status === 'pending' ||
                    item.status === 'in-progress' ||
                    (item.direction === 'send' && item.status === 'paused');
                  const canDelete = canDeleteTransfer(item);
                  const canRetry =
                    item.direction === 'send' &&
                    (item.status === 'failed' ||
                      item.status === 'rejected' ||
                      item.status === 'cancelled' ||
                      item.status === 'paused') &&
                    Boolean(item.localPath) &&
                    Boolean(item.peerDeviceId);
                  const canOpenPath = canOpenCompletedReceive(item);
                  const isBusy = busyTransferIds?.has(item.transferId) ?? false;
                  const activeMetricSummary = liveMetricSummary(item, messages);
                  const footStatusText = activeMetricSummary ?? item.error ?? null;
                  const isSelected = selectedTransferId === item.transferId;
                  const confirmingDelete = confirmingAction === `delete:${item.transferId}`;

                  return (
                    <li
                      key={item.transferId}
                      className={`transfer-item is-${item.status}${isWaitingForReceiver ? ' is-confirming' : ''}${isSelected ? ' is-selected is-detailed' : ''}`}
                    >
                      <div className="transfer-item-main">
                        <button
                          type="button"
                          className="transfer-item-summary-row"
                          aria-expanded={isSelected}
                          aria-controls={isSelected ? `transfer-detail-${item.transferId}` : undefined}
                          onClick={() => toggleTransferDetails(item.transferId)}
                        >
                          <div className="transfer-item-summary">
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
                              <div className="transfer-item-summary-metric-stack">
                                <div className="transfer-item-percent">{percent}%</div>
                                <div className="transfer-item-summary-metrics">
                                  {activeMetricSummary ?? ''}
                                </div>
                              </div>
                            </div>
                          </div>
                        </button>
                        <div
                          className="transfer-progress-track"
                          role="progressbar"
                          aria-label={`${statusText} ${item.fileName}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={percent}
                          aria-valuetext={isWaitingForReceiver ? messages.transferWaitingForReceiver : `${percent}%`}
                        >
                          <div className="transfer-progress-fill" style={{ width: `${percent}%` }} />
                        </div>
                        <div className="transfer-item-foot">
                          <span className="transfer-item-foot-primary">
                            {formatBytes(item.bytesTransferred)} / {formatBytes(item.fileSize)}
                            <span className="transfer-item-foot-peer">
                              {item.peerDeviceName || messages.unknownDevice}
                            </span>
                          </span>
                          {footStatusText && (
                            <span
                              className={`transfer-item-foot-secondary${item.error && !activeMetricSummary ? ' is-error' : ''}`}
                              title={footStatusText}
                            >
                              {footStatusText}
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <div id={`transfer-detail-${item.transferId}`} className="transfer-item-detail-body">
                            {hasLiveMetrics(item) && (
                              <div className="transfer-item-metrics">
                                <span>
                                  {messages.transferRateLabel}{' '}
                                  {item.transferRateBytesPerSecond
                                    ? formatTransferRate(item.transferRateBytesPerSecond)
                                    : '--/s'}
                                </span>
                                <span>
                                  {messages.transferEtaLabel}{' '}
                                  {item.estimatedSecondsRemaining ? formatEta(item.estimatedSecondsRemaining) : '--'}
                                </span>
                              </div>
                            )}
                            {item.error && (
                              <div className="transfer-item-error" title={item.error}>
                                {item.error}
                              </div>
                            )}
                            {(item.localPath || item.peerDeviceId) && (
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
                            {(canPause || canCancel || canRetry || canOpenPath) && (
                              <div className="transfer-item-actions">
                                {canPause && (
                                  <button
                                    type="button"
                                    className="button button-ghost transfer-item-action"
                                    onClick={() => void onPause(item.transferId)}
                                    disabled={isBusy || isBulkBusy}
                                    aria-busy={isBusy}
                                  >
                                    {messages.transferPause}
                                  </button>
                                )}
                                {canCancel && (
                                  <button
                                    type="button"
                                    className="button button-ghost transfer-item-action"
                                    onClick={() => void onCancel(item.transferId)}
                                    disabled={isBusy || isBulkBusy}
                                    aria-busy={isBusy}
                                  >
                                    {messages.transferCancel}
                                  </button>
                                )}
                                {canRetry && (
                                  <button
                                    type="button"
                                    className="button button-ghost transfer-item-action"
                                    onClick={() => void onRetry(item.transferId)}
                                    disabled={isBusy || isBulkBusy}
                                    aria-busy={isBusy}
                                  >
                                    {item.status === 'paused' ? messages.transferResume : messages.transferRetry}
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
                          </div>
                        )}
                      </div>
                      <div className="transfer-item-controls">
                        <button
                          type="button"
                          className="transfer-item-chevron transfer-item-detail-trigger"
                          onClick={() => toggleTransferDetails(item.transferId)}
                          aria-expanded={isSelected}
                          aria-controls={isSelected ? `transfer-detail-${item.transferId}` : undefined}
                          aria-label={`${isSelected ? messages.dismiss : messages.transferDetails} ${item.fileName}`}
                          title={isSelected ? messages.dismiss : messages.transferDetails}
                        >
                          <ChevronRight aria-hidden="true" size={16} strokeWidth={2.2} />
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            className={`transfer-item-delete${confirmingDelete ? ' is-danger-confirm' : ''}`}
                            onClick={() => void handleDeleteTransfer(item.transferId)}
                            disabled={isBusy || isBulkBusy}
                            aria-busy={isBusy}
                            aria-label={`${confirmingDelete ? messages.transferDeleteConfirm : messages.transferDelete} ${item.fileName}`}
                            title={confirmingDelete ? messages.transferDeleteConfirm : messages.transferDelete}
                          >
                            <Trash2 aria-hidden="true" size={15} strokeWidth={2} />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
