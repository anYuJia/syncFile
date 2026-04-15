import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

import { DeviceList } from './components/DeviceList';
import { DropZone } from './components/DropZone';
import { PairRequestQueuePrompt } from './components/PairRequestQueuePrompt';
import { PairDevicePrompt } from './components/PairDevicePrompt';
import { ReceivePrompt } from './components/ReceivePrompt';
import { SettingsModal } from './components/Settings';
import { TransferList } from './components/TransferList';
import { useLocale } from './hooks/useLocale';
import { useSyncFile } from './hooks/useSyncFile';
import type { Device, IncomingOffer, PairRequest, TrustedDevice } from '@shared/types';

const LEFT_PANE_SPLIT_KEY = 'syncfile.left-pane-manual-split-v1';
const RIGHT_PANE_SPLIT_KEY = 'syncfile.right-pane-manual-split-v4';
const DEFAULT_LEFT_PANE_SPLIT = 0.28;
const DEFAULT_RIGHT_PANE_SPLIT = 0.5;
const MIN_LEFT_PANE_SPLIT = 0.2;
const MAX_LEFT_PANE_SPLIT = 0.5;
const MIN_RIGHT_PANE_SPLIT = 0.2;
const MAX_RIGHT_PANE_SPLIT = 0.8;
const MIN_LEFT_PANE_WIDTH = 220;
const MIN_RIGHT_PANE_WIDTH = 420;
const MIN_RIGHT_PANE_SECTION_HEIGHT = 150;
const COLUMN_RESIZER_WIDTH = 12;
const RIGHT_PANE_RESIZER_HEIGHT = 12;
const COMPACT_LAYOUT_QUERY = '(max-width: 1040px)';

type CompactSection = 'manifest' | 'dispatch' | 'ledger';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function App(): JSX.Element {
  const { locale, messages, setLocale } = useLocale();
  const {
    selfDevice,
    devices,
    pendingOffers,
    transfers,
    errorMessage,
    clearError,
    refreshDevices,
    sendFile,
    pauseTransfer,
    cancelTransfer,
    retryTransfer,
    acceptOffer,
    rejectOffer,
    openSandbox
  } = useSyncFile(messages);

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [selectedIncomingOfferId, setSelectedIncomingOfferId] = useState<string | null>(null);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [pendingPairRequests, setPendingPairRequests] = useState<PairRequest[]>([]);
  const [selectedPairRequestId, setSelectedPairRequestId] = useState<string | null>(null);
  const [pairingDeviceId, setPairingDeviceId] = useState<string | null>(null);
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRefreshingDevices, setIsRefreshingDevices] = useState(false);
  const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);
  const [desktopNotificationsEnabled, setDesktopNotificationsEnabled] = useState(true);
  const [leftPaneSplit, setLeftPaneSplit] = useState<number>(() => {
    const saved = localStorage.getItem(LEFT_PANE_SPLIT_KEY);
    const parsed = saved ? Number(saved) : Number.NaN;
    return Number.isFinite(parsed)
      ? clamp(parsed, MIN_LEFT_PANE_SPLIT, MAX_LEFT_PANE_SPLIT)
      : DEFAULT_LEFT_PANE_SPLIT;
  });
  const [rightPaneSplit, setRightPaneSplit] = useState<number>(() => {
    const saved = localStorage.getItem(RIGHT_PANE_SPLIT_KEY);
    const parsed = saved ? Number(saved) : Number.NaN;
    return Number.isFinite(parsed)
      ? clamp(parsed, MIN_RIGHT_PANE_SPLIT, MAX_RIGHT_PANE_SPLIT)
      : DEFAULT_RIGHT_PANE_SPLIT;
  });
  const [isResizingRows, setIsResizingRows] = useState(false);
  const [isResizingColumns, setIsResizingColumns] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [isCompactLayout, setIsCompactLayout] = useState<boolean>(() => {
    return window.matchMedia(COMPACT_LAYOUT_QUERY).matches;
  });
  const [compactSection, setCompactSection] = useState<CompactSection>('manifest');
  const [busyTransferIds, setBusyTransferIds] = useState<Set<string>>(new Set());
  const [unreadOfferIds, setUnreadOfferIds] = useState<Set<string>>(new Set());
  const [unreadPairRequestIds, setUnreadPairRequestIds] = useState<Set<string>>(new Set());
  const contentGridRef = useRef<HTMLElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const seenOfferIdsRef = useRef<Set<string>>(new Set());
  const seenPairRequestIdsRef = useRef<Set<string>>(new Set());
  const lastTransferNotificationStatusRef = useRef<Map<string, string>>(new Map());
  const selectedDevice = devices.find((device) => device.deviceId === selectedDeviceId) ?? null;
  const pairingDevice = devices.find((device) => device.deviceId === pairingDeviceId) ?? null;
  const trustedDeviceKeys = useMemo(
    () => new Set(trustedDevices.map((device) => `${device.deviceId}:${device.trustFingerprint}`)),
    [trustedDevices]
  );

  useEffect(() => {
    void refreshAppSettings();
  }, []);

  useEffect(() => {
    const offIncomingPairRequest = window.syncFile.onIncomingPairRequest((request) => {
      setPendingPairRequests((prev) => [...prev, request]);
    });
    return () => offIncomingPairRequest();
  }, []);

  useEffect(() => {
    if (devices.length === 0) {
      setSelectedDeviceId(null);
      if (isCompactLayout) {
        setCompactSection('manifest');
      }
      return;
    }

    const selectedStillOnline = devices.some((item) => item.deviceId === selectedDeviceId);
    if (selectedStillOnline) {
      return;
    }

    setSelectedDeviceId(devices[0].deviceId);
  }, [devices, isCompactLayout, selectedDeviceId]);

  useEffect(() => {
    if (pendingOffers.length === 0) {
      setSelectedIncomingOfferId(null);
      return;
    }

    if (selectedIncomingOfferId && pendingOffers.some((offer) => offer.offerId === selectedIncomingOfferId)) {
      return;
    }

    setSelectedIncomingOfferId(pendingOffers[0].offerId);
  }, [pendingOffers, selectedIncomingOfferId]);

  useEffect(() => {
    if (pendingPairRequests.length === 0) {
      setSelectedPairRequestId(null);
      return;
    }

    if (
      selectedPairRequestId &&
      pendingPairRequests.some((request) => request.requestId === selectedPairRequestId)
    ) {
      return;
    }

    setSelectedPairRequestId(pendingPairRequests[0].requestId);
  }, [pendingPairRequests, selectedPairRequestId]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(COMPACT_LAYOUT_QUERY);
    const updateLayout = (): void => {
      setIsCompactLayout(mediaQuery.matches);
    };
    updateLayout();
    mediaQuery.addEventListener('change', updateLayout);
    return () => mediaQuery.removeEventListener('change', updateLayout);
  }, []);

  useEffect(() => {
    for (const offer of pendingOffers) {
      if (seenOfferIdsRef.current.has(offer.offerId)) {
        continue;
      }
      seenOfferIdsRef.current.add(offer.offerId);
      setUnreadOfferIds((current) => new Set(current).add(offer.offerId));
      maybeShowDesktopNotification(
        desktopNotificationsEnabled,
        messages.notificationIncomingTitle,
        messages.notificationIncomingBody(offer.fromDevice.name, offer.fileName),
        () => {
          setSelectedIncomingOfferId(offer.offerId);
          if (isCompactLayout) {
            setCompactSection('manifest');
          }
        }
      );
    }

    for (const offerId of [...seenOfferIdsRef.current]) {
      if (!pendingOffers.some((offer) => offer.offerId === offerId)) {
        seenOfferIdsRef.current.delete(offerId);
      }
    }
    setUnreadOfferIds((current) => {
      const next = new Set(current);
      for (const offerId of [...next]) {
        if (!pendingOffers.some((offer) => offer.offerId === offerId)) {
          next.delete(offerId);
        }
      }
      return next;
    });
  }, [desktopNotificationsEnabled, messages, pendingOffers]);

  useEffect(() => {
    for (const request of pendingPairRequests) {
      if (seenPairRequestIdsRef.current.has(request.requestId)) {
        continue;
      }
      seenPairRequestIdsRef.current.add(request.requestId);
      setUnreadPairRequestIds((current) => new Set(current).add(request.requestId));
      maybeShowDesktopNotification(
        desktopNotificationsEnabled,
        messages.notificationPairTitle,
        messages.notificationPairBody(request.fromDevice.name),
        () => {
          setSelectedPairRequestId(request.requestId);
          if (isCompactLayout) {
            setCompactSection('manifest');
          }
        }
      );
    }

    for (const requestId of [...seenPairRequestIdsRef.current]) {
      if (!pendingPairRequests.some((request) => request.requestId === requestId)) {
        seenPairRequestIdsRef.current.delete(requestId);
      }
    }
    setUnreadPairRequestIds((current) => {
      const next = new Set(current);
      for (const requestId of [...next]) {
        if (!pendingPairRequests.some((request) => request.requestId === requestId)) {
          next.delete(requestId);
        }
      }
      return next;
    });
  }, [desktopNotificationsEnabled, messages, pendingPairRequests]);

  useEffect(() => {
    const clearVisibleUnread = (): void => {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) {
        return;
      }
      if (selectedIncomingOfferId) {
        setUnreadOfferIds((current) => {
          if (!current.has(selectedIncomingOfferId)) {
            return current;
          }
          const next = new Set(current);
          next.delete(selectedIncomingOfferId);
          return next;
        });
      }
      if (selectedPairRequestId) {
        setUnreadPairRequestIds((current) => {
          if (!current.has(selectedPairRequestId)) {
            return current;
          }
          const next = new Set(current);
          next.delete(selectedPairRequestId);
          return next;
        });
      }
    };

    clearVisibleUnread();
    window.addEventListener('focus', clearVisibleUnread);
    document.addEventListener('visibilitychange', clearVisibleUnread);
    return () => {
      window.removeEventListener('focus', clearVisibleUnread);
      document.removeEventListener('visibilitychange', clearVisibleUnread);
    };
  }, [selectedIncomingOfferId, selectedPairRequestId]);

  useEffect(() => {
    const trackedStatuses = new Set(['completed', 'failed', 'rejected', 'cancelled']);
    for (const transfer of transfers) {
      const previousStatus = lastTransferNotificationStatusRef.current.get(transfer.transferId);
      if (previousStatus === transfer.status) {
        continue;
      }
      lastTransferNotificationStatusRef.current.set(transfer.transferId, transfer.status);
      if (!trackedStatuses.has(transfer.status)) {
        continue;
      }

      if (transfer.status === 'completed') {
        maybeShowDesktopNotification(
          desktopNotificationsEnabled,
          messages.notificationTransferCompleteTitle,
          messages.notificationTransferCompleteBody(transfer.fileName),
          () => {
            setSelectedTransferId(transfer.transferId);
            if (isCompactLayout) {
              setCompactSection('ledger');
            }
          }
        );
      } else {
        maybeShowDesktopNotification(
          desktopNotificationsEnabled,
          messages.notificationTransferFailedTitle,
          messages.notificationTransferFailedBody(transfer.fileName),
          () => {
            setSelectedTransferId(transfer.transferId);
            if (isCompactLayout) {
              setCompactSection('ledger');
            }
          }
        );
      }
    }
  }, [desktopNotificationsEnabled, isCompactLayout, messages, transfers]);

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem(LEFT_PANE_SPLIT_KEY, String(leftPaneSplit));
  }, [leftPaneSplit]);

  useEffect(() => {
    localStorage.setItem(RIGHT_PANE_SPLIT_KEY, String(rightPaneSplit));
  }, [rightPaneSplit]);

  useEffect(() => {
    if (!isResizingRows) {
      return;
    }

    const updateSplitFromPointer = (clientY: number): void => {
      const pane = rightPaneRef.current;
      if (!pane) {
        return;
      }

      const rect = pane.getBoundingClientRect();
      const availableHeight = rect.height - RIGHT_PANE_RESIZER_HEIGHT;
      if (availableHeight <= MIN_RIGHT_PANE_SECTION_HEIGHT * 2) {
        return;
      }

      const minRatio = MIN_RIGHT_PANE_SECTION_HEIGHT / availableHeight;
      const maxRatio = 1 - minRatio;
      const nextRatio = (clientY - rect.top - RIGHT_PANE_RESIZER_HEIGHT / 2) / availableHeight;
      setRightPaneSplit(clamp(nextRatio, minRatio, maxRatio));
    };

    const handlePointerMove = (event: PointerEvent): void => {
      updateSplitFromPointer(event.clientY);
    };

    const stopResizing = (): void => {
      setIsResizingRows(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResizing);
    window.addEventListener('pointercancel', stopResizing);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResizing);
      window.removeEventListener('pointercancel', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingRows]);

  useEffect(() => {
    if (!isResizingColumns) {
      return;
    }

    const updateSplitFromPointer = (clientX: number): void => {
      const pane = contentGridRef.current;
      if (!pane) {
        return;
      }

      const rect = pane.getBoundingClientRect();
      const availableWidth = rect.width - COLUMN_RESIZER_WIDTH;
      if (availableWidth <= MIN_LEFT_PANE_WIDTH + MIN_RIGHT_PANE_WIDTH) {
        return;
      }

      const minRatio = MIN_LEFT_PANE_WIDTH / availableWidth;
      const maxRatio = 1 - MIN_RIGHT_PANE_WIDTH / availableWidth;
      const nextRatio = (clientX - rect.left - COLUMN_RESIZER_WIDTH / 2) / availableWidth;
      setLeftPaneSplit(clamp(nextRatio, minRatio, maxRatio));
    };

    const handlePointerMove = (event: PointerEvent): void => {
      updateSplitFromPointer(event.clientX);
    };

    const stopResizing = (): void => {
      setIsResizingColumns(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResizing);
    window.addEventListener('pointercancel', stopResizing);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResizing);
      window.removeEventListener('pointercancel', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingColumns]);

  async function handleSendFiles(filePaths: string[]): Promise<void> {
    const fallbackTarget = devices.length === 1 ? devices[0].deviceId : null;
    const targetDeviceId = selectedDeviceId ?? fallbackTarget;
    if (!targetDeviceId) return;
    for (const filePath of filePaths) {
      try {
        await sendFile(targetDeviceId, filePath);
      } catch {
        // Hook already stores and exposes the error message.
      }
    }
    if (isCompactLayout) {
      setCompactSection('ledger');
    }
  }

  async function handleAccept(offerId: string): Promise<void> {
    try {
      setBusyOfferId(offerId);
      setUnreadOfferIds((current) => {
        const next = new Set(current);
        next.delete(offerId);
        return next;
      });
      await acceptOffer(offerId);
    } catch {
      // Hook already stores and exposes the error message.
    } finally {
      setBusyOfferId(null);
    }
  }

  async function handleReject(offerId: string): Promise<void> {
    try {
      setBusyOfferId(offerId);
      setUnreadOfferIds((current) => {
        const next = new Set(current);
        next.delete(offerId);
        return next;
      });
      await rejectOffer(offerId);
    } catch {
      // Hook already stores and exposes the error message.
    } finally {
      setBusyOfferId(null);
    }
  }

  async function handleOpenSandbox(): Promise<void> {
    try {
      await openSandbox();
    } catch {
      // Hook already stores and exposes the error message.
    }
  }

  async function handleCancelTransfer(transferId: string): Promise<void> {
    try {
      markTransferBusy(transferId, true);
      await cancelTransfer(transferId);
    } catch {
      // Hook already stores and exposes the error message.
    } finally {
      markTransferBusy(transferId, false);
    }
  }

  async function handlePauseTransfer(transferId: string): Promise<void> {
    try {
      markTransferBusy(transferId, true);
      await pauseTransfer(transferId);
    } catch {
      // Hook already stores and exposes the error message.
    } finally {
      markTransferBusy(transferId, false);
    }
  }

  async function handleRetryTransfer(transferId: string): Promise<void> {
    try {
      markTransferBusy(transferId, true);
      await retryTransfer(transferId);
    } catch {
      // Hook already stores and exposes the error message.
    } finally {
      markTransferBusy(transferId, false);
    }
  }

  async function handleClearTransfers(transferIds: string[]): Promise<void> {
    if (transferIds.length === 0) {
      return;
    }
    try {
      await window.syncFile.removeTransferHistoryItems(transferIds);
    } catch {
      // Best effort only.
    }
  }

  async function refreshAppSettings(): Promise<void> {
    try {
      const currentSettings = await window.syncFile.getSettings();
      setTrustedDevices(currentSettings.trustedDevices);
      setDesktopNotificationsEnabled(currentSettings.desktopNotifications);
    } catch {
      // Best effort only.
    }
  }

  async function handleRefreshDevices(): Promise<void> {
    try {
      setIsRefreshingDevices(true);
      const list = await refreshDevices();
      if (list.length > 0 && !list.some((item) => item.deviceId === selectedDeviceId)) {
        setSelectedDeviceId(list[0]?.deviceId ?? null);
      }
    } catch {
      // Best effort only.
    } finally {
      window.setTimeout(() => {
        setIsRefreshingDevices(false);
      }, 600);
    }
  }

  async function handleTrustAndAccept(offer: IncomingOffer): Promise<void> {
    try {
      setBusyOfferId(offer.offerId);
      try {
        const currentSettings = await window.syncFile.getSettings();
        const trustedDevices = dedupeTrustedDevices([
          ...currentSettings.trustedDevices,
          {
            deviceId: offer.fromDevice.deviceId,
            name: offer.fromDevice.name,
            trustFingerprint: offer.fromDevice.trustFingerprint,
            trustPublicKey: offer.fromDevice.trustPublicKey,
            trustedAt: Date.now()
          }
        ]);

        await window.syncFile.saveSettings({ trustedDevices });
        setTrustedDevices(trustedDevices);
      } catch {
        // Accept the current file even if persisting trust fails.
      }

      await acceptOffer(offer.offerId);
    } catch {
      // Hook already stores and exposes the error message where possible.
    } finally {
      setBusyOfferId(null);
    }
  }

  async function handlePairDevice(device: Device): Promise<void> {
    try {
      await window.syncFile.pairDevice(device.deviceId);
      await refreshAppSettings();
      setPairingDeviceId(null);
    } catch {
      // Best effort; settings error remains in UI elsewhere.
    }
  }

  async function handleAcceptPairRequest(requestId: string): Promise<void> {
    try {
      setUnreadPairRequestIds((current) => {
        const next = new Set(current);
        next.delete(requestId);
        return next;
      });
      await window.syncFile.acceptPairRequest(requestId);
      setPendingPairRequests((prev) => prev.filter((request) => request.requestId !== requestId));
      await refreshAppSettings();
    } catch {
      // Best effort only.
    }
  }

  async function handleRejectPairRequest(requestId: string): Promise<void> {
    try {
      setUnreadPairRequestIds((current) => {
        const next = new Set(current);
        next.delete(requestId);
        return next;
      });
      await window.syncFile.rejectPairRequest(requestId);
      setPendingPairRequests((prev) => prev.filter((request) => request.requestId !== requestId));
    } catch {
      // Best effort only.
    }
  }

  const currentOffer =
    pendingOffers.find((offer) => offer.offerId === selectedIncomingOfferId) ?? pendingOffers[0] ?? null;
  const currentPairRequest =
    pendingPairRequests.find((request) => request.requestId === selectedPairRequestId) ??
    pendingPairRequests[0] ??
    null;
  const contentGridStyle = {
    '--left-pane-split': leftPaneSplit
  } as CSSProperties;
  const rightPaneStyle = {
    '--right-pane-split': rightPaneSplit
  } as CSSProperties;
  const unreadRequestCount = unreadOfferIds.size + unreadPairRequestIds.size;

  const handlePaneResizerPointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    setIsResizingColumns(false);
    setIsResizingRows(true);
  };

  const handlePaneResizerDoubleClick = (): void => {
    setRightPaneSplit(DEFAULT_RIGHT_PANE_SPLIT);
  };

  const handleColumnResizerPointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    setIsResizingRows(false);
    setIsResizingColumns(true);
  };

  const handleColumnResizerDoubleClick = (): void => {
    setLeftPaneSplit(DEFAULT_LEFT_PANE_SPLIT);
  };

  const markTransferBusy = (transferId: string, isBusy: boolean): void => {
    setBusyTransferIds((current) => {
      const next = new Set(current);
      if (isBusy) {
        next.add(transferId);
      } else {
        next.delete(transferId);
      }
      return next;
    });
  };

  const handleSelectDevice = (deviceId: string): void => {
    setSelectedDeviceId(deviceId);
    if (isCompactLayout) {
      setCompactSection('dispatch');
    }
  };

  const handleOpenRequestsInbox = (): void => {
    const unreadOfferId = pendingOffers.find((offer) => unreadOfferIds.has(offer.offerId))?.offerId;
    if (unreadOfferId) {
      setSelectedIncomingOfferId(unreadOfferId);
      if (isCompactLayout) {
        setCompactSection('manifest');
      }
      return;
    }

    const unreadPairRequestId = pendingPairRequests.find((request) => unreadPairRequestIds.has(request.requestId))?.requestId;
    if (unreadPairRequestId) {
      setSelectedPairRequestId(unreadPairRequestId);
      if (isCompactLayout) {
        setCompactSection('manifest');
      }
      return;
    }

    if (pendingOffers[0]) {
      setSelectedIncomingOfferId(pendingOffers[0].offerId);
      if (isCompactLayout) {
        setCompactSection('manifest');
      }
      return;
    }

    if (pendingPairRequests[0]) {
      setSelectedPairRequestId(pendingPairRequests[0].requestId);
      if (isCompactLayout) {
        setCompactSection('manifest');
      }
    }
  };

  const showManifest = !isCompactLayout || compactSection === 'manifest';
  const showDispatch = !isCompactLayout || compactSection === 'dispatch';
  const showLedger = !isCompactLayout || compactSection === 'ledger';

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1 className="topbar-title">syncFile</h1>
        {selfDevice && (
          <span className="topbar-status">{selfDevice.name}</span>
        )}

        <div className="topbar-actions">
          <button
            type="button"
            className="button button-muted topbar-icon-button"
            onClick={handleOpenRequestsInbox}
            title={messages.requestsInbox}
            aria-label={messages.requestsInbox}
          >
            <span className="topbar-button-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 7h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
                <path d="M22 7l-10 7L2 7" />
              </svg>
              {unreadRequestCount > 0 && <span className="topbar-badge">{unreadRequestCount}</span>}
            </span>
          </button>
          <button
            type="button"
            className="button button-muted topbar-icon-button"
            onClick={() => setIsSettingsOpen(true)}
            title={messages.settings}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <div className="locale-switch" aria-label={messages.languageLabel}>
            <button
              type="button"
              className={`locale-switch-button${locale === 'zh' ? ' is-active' : ''}`}
              onClick={() => setLocale('zh')}
            >
              中文
            </button>
            <button
              type="button"
              className={`locale-switch-button${locale === 'en' ? ' is-active' : ''}`}
              onClick={() => setLocale('en')}
            >
              EN
            </button>
          </div>
          <button
            type="button"
            className="button button-muted"
            onClick={() => setIsDarkMode((prev) => !prev)}
            title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDarkMode ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2.5" />
                <path d="M12 19.5V22" />
                <path d="M4.93 4.93l1.77 1.77" />
                <path d="M17.3 17.3l1.77 1.77" />
                <path d="M2 12h2.5" />
                <path d="M19.5 12H22" />
                <path d="M4.93 19.07l1.77-1.77" />
                <path d="M17.3 6.7l1.77-1.77" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
              </svg>
            )}
          </button>
          <button type="button" className="button button-muted" onClick={() => void handleOpenSandbox()}>
            {messages.openSandbox}
          </button>
        </div>
      </header>

      {errorMessage && (
        <div className="error-banner" role="alert">
          <span>{errorMessage}</span>
          <button type="button" className="button button-ghost" onClick={clearError}>
            {messages.dismiss}
          </button>
        </div>
      )}

      <main
        ref={contentGridRef}
        className={`content-grid${isResizingRows ? ' is-resizing-rows' : ''}${isResizingColumns ? ' is-resizing-columns' : ''}${isCompactLayout ? ' is-compact-layout' : ''}`}
        style={contentGridStyle}
      >
        {isCompactLayout && (
          <div className="compact-section-switcher" role="tablist" aria-label={messages.compactSectionsAriaLabel}>
            {[
              ['manifest', messages.onlineDevices],
              ['dispatch', messages.sendFile],
              ['ledger', messages.transferActivity]
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={compactSection === value}
                className={`compact-section-tab${compactSection === value ? ' is-active' : ''}`}
                onClick={() => setCompactSection(value as CompactSection)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {showManifest && (
        <section className="card card-manifest">
          <div className="card-head">
            <h2>{messages.onlineDevices}</h2>
            <div className="card-head-actions">
              <button
                type="button"
                className={`button button-ghost manifest-refresh-button${isRefreshingDevices ? ' is-spinning' : ''}`}
                onClick={() => void handleRefreshDevices()}
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
            selectedDeviceId={selectedDeviceId}
            trustedDeviceKeys={trustedDeviceKeys}
            onSelect={handleSelectDevice}
            onRefresh={handleRefreshDevices}
            messages={messages}
          />
        </section>
        )}

        {!isCompactLayout && (
        <button
          type="button"
          className={`column-resizer${isResizingColumns ? ' is-active' : ''}`}
          onPointerDown={handleColumnResizerPointerDown}
          onDoubleClick={handleColumnResizerDoubleClick}
          aria-label="Resize online devices and main panels"
        >
          <span className="column-resizer-handle" aria-hidden="true" />
        </button>
        )}

        {(!isCompactLayout || showDispatch || showLedger) && (
        <div
          ref={rightPaneRef}
          className="right-pane"
          style={rightPaneStyle}
        >
          {showDispatch && (
          <section className="card card-dispatch">
            <div className="card-head">
              <h2>{messages.sendFile}</h2>
              {selectedDevice && (
                trustedDeviceKeys.has(`${selectedDevice.deviceId}:${selectedDevice.trustFingerprint}`) ? (
                  <span className="device-item-trusted">{messages.pairedDevice}</span>
                ) : (
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => setPairingDeviceId(selectedDevice.deviceId)}
                  >
                    {messages.pairDevice}
                  </button>
                )
              )}
            </div>
            <DropZone
              onSend={(filePaths) => void handleSendFiles(filePaths)}
              messages={messages}
              selectedDeviceName={selectedDevice?.name ?? null}
              selfDeviceName={selfDevice?.name ?? null}
            />
          </section>
          )}

          {!isCompactLayout && (
          <button
            type="button"
            className={`pane-resizer${isResizingRows ? ' is-active' : ''}`}
            onPointerDown={handlePaneResizerPointerDown}
            onDoubleClick={handlePaneResizerDoubleClick}
            aria-label="Resize send and transfer panels"
          >
            <span className="pane-resizer-handle" aria-hidden="true" />
          </button>
          )}

          {showLedger && (
          <section className="card card-ledger">
            <div className="card-head">
              <h2>{messages.transferActivity}</h2>
            </div>
            <TransferList
              transfers={transfers}
              messages={messages}
              onPause={handlePauseTransfer}
              onCancel={handleCancelTransfer}
              onRetry={handleRetryTransfer}
              onClearTransfers={handleClearTransfers}
              busyTransferIds={busyTransferIds}
              selectedTransferId={selectedTransferId}
              onSelectedTransferIdChange={setSelectedTransferId}
            />
          </section>
          )}
        </div>
        )}
      </main>

      {currentOffer && (
        <ReceivePrompt
          offers={pendingOffers}
          selectedOfferId={currentOffer.offerId}
          trustedDeviceKeys={trustedDeviceKeys}
          onSelectOffer={(offerId) => {
            setSelectedIncomingOfferId(offerId);
            setUnreadOfferIds((current) => {
              if (!current.has(offerId)) {
                return current;
              }
              const next = new Set(current);
              next.delete(offerId);
              return next;
            });
          }}
          busy={busyOfferId === currentOffer.offerId}
          onAccept={handleAccept}
          onTrustAndAccept={handleTrustAndAccept}
          onReject={handleReject}
          messages={messages}
        />
      )}
      {pairingDevice && selfDevice && (
        <PairDevicePrompt
          device={pairingDevice}
          selfFingerprint={selfDevice.trustFingerprint}
          onConfirm={handlePairDevice}
          onClose={() => setPairingDeviceId(null)}
          messages={messages}
        />
      )}
      {currentPairRequest && selfDevice && (
        <PairRequestQueuePrompt
          requests={pendingPairRequests}
          selectedRequestId={currentPairRequest.requestId}
          onSelectRequest={(requestId) => {
            setSelectedPairRequestId(requestId);
            setUnreadPairRequestIds((current) => {
              if (!current.has(requestId)) {
                return current;
              }
              const next = new Set(current);
              next.delete(requestId);
              return next;
            });
          }}
          selfFingerprint={selfDevice.trustFingerprint}
          busy={false}
          onAccept={handleAcceptPairRequest}
          onReject={handleRejectPairRequest}
          messages={messages}
        />
      )}
      {isSettingsOpen && (
        <SettingsModal
          messages={messages}
          onClose={() => {
            setIsSettingsOpen(false);
            void refreshAppSettings();
          }}
        />
      )}
    </div>
  );
}

function dedupeTrustedDevices(devices: TrustedDevice[]): TrustedDevice[] {
  const deduped = new Map<string, TrustedDevice>();
  for (const device of devices) {
    deduped.set(`${device.deviceId}:${device.trustFingerprint}`, device);
  }
  return [...deduped.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function maybeShowDesktopNotification(
  enabled: boolean,
  title: string,
  body: string,
  onClick?: () => void
): void {
  if (!enabled) {
    return;
  }
  if (document.visibilityState === 'visible' && document.hasFocus()) {
    return;
  }
  if (typeof window.Notification !== 'function' || window.Notification.permission !== 'granted') {
    return;
  }

  const notification = new window.Notification(title, { body, silent: false });
  notification.onclick = () => {
    window.focus();
    onClick?.();
    notification.close();
  };
}
