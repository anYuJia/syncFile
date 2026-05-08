import { useEffect, useMemo, useRef, useState } from 'react';

import { type PendingFile } from './components/DropZone';
import { DispatchPanel } from './components/DispatchPanel';
import { LedgerPanel } from './components/LedgerPanel';
import { ManifestPanel } from './components/ManifestPanel';
import { PairDevicePrompt } from './components/PairDevicePrompt';
import { LogViewer } from './components/LogViewer';
import { RequestsInboxPanel } from './components/RequestsInboxPanel';
import { SettingsModal } from './components/Settings';
import { AppSidebar } from './components/AppSidebar';
import { WorkspaceHeader } from './components/WorkspaceHeader';
import { useLocale } from './hooks/useLocale';
import { useSyncFile } from './hooks/useSyncFile';
import type { SelectedRecipientSnapshot, WorkspaceSection } from './types/workspace';
import type {
  Device,
  DeviceReachability,
  IncomingOffer,
  PairRequest,
  RuntimeLogEntry,
  TrustedDevice
} from '@shared/types';

const SIDEBAR_COLLAPSED_KEY = 'syncfile.sidebar-collapsed-v1';
const SEND_DRAFT_KEY = 'syncfile.send-draft-v1';
const THEME_KEY = 'syncfile.theme-v2';
const COMPACT_LAYOUT_QUERY = '(max-width: 1040px)';

type RequestsInboxTab = 'files' | 'pairs';

interface StoredRecipientDraft {
  deviceId: string;
  name: string;
  avatarDataUrl?: string;
  hasAvatar?: boolean;
  profileRevision?: number;
  trustFingerprint: string;
  platform: string;
  version: string;
}

interface NoticeState {
  kind: 'info' | 'warn';
  message: string;
}

function progressPercent(fileSize: number, bytesTransferred: number, status?: string): number {
  if (status === 'completed') {
    return 100;
  }
  if (fileSize <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round((bytesTransferred / fileSize) * 100)));
}

function loadInitialSendDraft(): {
  selectedDeviceIds: string[];
  selectedRecipientSnapshots: Record<string, Device>;
  pendingSendFiles: PendingFile[];
} {
  try {
    const raw = localStorage.getItem(SEND_DRAFT_KEY);
    if (!raw) {
      return { selectedDeviceIds: [], selectedRecipientSnapshots: {}, pendingSendFiles: [] };
    }
    const parsed = JSON.parse(raw) as {
      selectedDeviceIds?: string[];
      selectedRecipientSnapshots?: Record<string, StoredRecipientDraft>;
      pendingSendFiles?: PendingFile[];
    };
    return {
      selectedDeviceIds: Array.isArray(parsed.selectedDeviceIds) ? parsed.selectedDeviceIds : [],
      selectedRecipientSnapshots:
        parsed.selectedRecipientSnapshots && typeof parsed.selectedRecipientSnapshots === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.selectedRecipientSnapshots).map(([deviceId, snapshot]) => [
                deviceId,
                inflateStoredRecipientDraft(snapshot)
              ])
            )
          : {},
      pendingSendFiles: Array.isArray(parsed.pendingSendFiles) ? parsed.pendingSendFiles : []
    };
  } catch {
    return { selectedDeviceIds: [], selectedRecipientSnapshots: {}, pendingSendFiles: [] };
  }
}

function inflateStoredRecipientDraft(snapshot: StoredRecipientDraft): Device {
  return {
    deviceId: snapshot.deviceId,
    name: snapshot.name,
    avatarDataUrl: snapshot.avatarDataUrl,
    hasAvatar: snapshot.hasAvatar,
    profileRevision: snapshot.profileRevision,
    trustFingerprint: snapshot.trustFingerprint,
    trustPublicKey: '',
    host: '',
    address: '',
    port: 0,
    platform: snapshot.platform,
    version: snapshot.version
  };
}

function compactRecipientSnapshot(device: Device): StoredRecipientDraft {
  return {
    deviceId: device.deviceId,
    name: device.name,
    avatarDataUrl: device.avatarDataUrl,
    hasAvatar: device.hasAvatar,
    profileRevision: device.profileRevision,
    trustFingerprint: device.trustFingerprint,
    platform: device.platform,
    version: device.version
  };
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

  const initialSendDraft = useMemo(() => loadInitialSendDraft(), []);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>(initialSendDraft.selectedDeviceIds);
  const [selectedRecipientSnapshots, setSelectedRecipientSnapshots] = useState<Record<string, Device>>(
    initialSendDraft.selectedRecipientSnapshots
  );
  const [focusedDeviceId, setFocusedDeviceId] = useState<string | null>(null);
  const [selectedIncomingOfferId, setSelectedIncomingOfferId] = useState<string | null>(null);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [pendingPairRequests, setPendingPairRequests] = useState<PairRequest[]>([]);
  const [selectedPairRequestId, setSelectedPairRequestId] = useState<string | null>(null);
  const [pairingDeviceId, setPairingDeviceId] = useState<string | null>(null);
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLogViewerOpen, setIsLogViewerOpen] = useState(false);
  const [requestsInboxTab, setRequestsInboxTab] = useState<RequestsInboxTab>('files');
  const [isRefreshingDevices, setIsRefreshingDevices] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);
  const [runtimeLogEntries, setRuntimeLogEntries] = useState<RuntimeLogEntry[]>([]);
  const [reachabilityByDeviceId, setReachabilityByDeviceId] = useState<Record<string, DeviceReachability>>({});
  const [desktopNotificationsEnabled, setDesktopNotificationsEnabled] = useState(true);
  const [pendingSendFiles, setPendingSendFiles] = useState<PendingFile[]>(initialSendDraft.pendingSendFiles);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  });
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved ? saved === 'dark' : true;
  });
  const [isCompactLayout, setIsCompactLayout] = useState<boolean>(() => {
    return window.matchMedia(COMPACT_LAYOUT_QUERY).matches;
  });
  const [activeSection, setActiveSection] = useState<WorkspaceSection>(() =>
    initialSendDraft.selectedDeviceIds.length > 0 || initialSendDraft.pendingSendFiles.length > 0
      ? 'dispatch'
      : 'manifest'
  );
  const [busyTransferIds, setBusyTransferIds] = useState<Set<string>>(new Set());
  const [unreadOfferIds, setUnreadOfferIds] = useState<Set<string>>(new Set());
  const [unreadPairRequestIds, setUnreadPairRequestIds] = useState<Set<string>>(new Set());
  const seenOfferIdsRef = useRef<Set<string>>(new Set());
  const seenPairRequestIdsRef = useRef<Set<string>>(new Set());
  const lastTransferNotificationStatusRef = useRef<Map<string, string>>(new Map());
  const probeKeyByDeviceIdRef = useRef<Map<string, string>>(new Map());
  const selectedDevices: SelectedRecipientSnapshot[] = selectedDeviceIds.flatMap((deviceId) => {
      const onlineDevice = devices.find((device) => device.deviceId === deviceId);
      const snapshot = onlineDevice ?? selectedRecipientSnapshots[deviceId];
      if (!snapshot) {
        return [];
      }
      const reachability = reachabilityByDeviceId[deviceId];
      return [{
        ...snapshot,
        isOnline: Boolean(onlineDevice),
        reachability: onlineDevice ? reachability?.status ?? 'checking' : 'unknown',
        reachabilityError: reachability?.error
      } satisfies SelectedRecipientSnapshot];
    });
  const pairingDevice = devices.find((device) => device.deviceId === pairingDeviceId) ?? null;
  const trustedDeviceKeys = useMemo(
    () => new Set(trustedDevices.map((device) => `${device.deviceId}:${device.trustFingerprint}`)),
    [trustedDevices]
  );

  useEffect(() => {
    void refreshAppSettings();
  }, []);

  useEffect(() => {
    void refreshRuntimeLogs();
    const offRuntimeLog = window.syncFile.onRuntimeLog((entry) => {
      setRuntimeLogEntries((prev) => [entry, ...prev].slice(0, 500));
    });
    return () => {
      offRuntimeLog();
    };
  }, []);

  useEffect(() => {
    const offIncomingPairRequest = window.syncFile.onIncomingPairRequest((request) => {
      setPendingPairRequests((prev) => [...prev, request]);
    });
    const offPairRequestRemoved = window.syncFile.onPairRequestRemoved((requestId) => {
      setPendingPairRequests((prev) => prev.filter((request) => request.requestId !== requestId));
      setUnreadPairRequestIds((current) => {
        if (!current.has(requestId)) {
          return current;
        }
        const next = new Set(current);
        next.delete(requestId);
        return next;
      });
    });
    return () => {
      offIncomingPairRequest();
      offPairRequestRemoved();
    };
  }, []);

  useEffect(() => {
    if (devices.length === 0) {
      setFocusedDeviceId(null);
      if (isCompactLayout) {
        setActiveSection('manifest');
      }
      return;
    }

    setSelectedRecipientSnapshots((current) => {
      const next = { ...current };
      for (const device of devices) {
        if (selectedDeviceIds.includes(device.deviceId)) {
          next[device.deviceId] = device;
        }
      }
      return next;
    });
    setFocusedDeviceId((current) => {
      if (current && devices.some((item) => item.deviceId === current)) {
        return current;
      }
      return devices[0]?.deviceId ?? null;
    });
  }, [devices, isCompactLayout, selectedDeviceIds]);

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
    let active = true;
    const onlineDeviceIds = new Set(devices.map((device) => device.deviceId));
    for (const deviceId of [...probeKeyByDeviceIdRef.current.keys()]) {
      if (!onlineDeviceIds.has(deviceId)) {
        probeKeyByDeviceIdRef.current.delete(deviceId);
      }
    }

    setReachabilityByDeviceId((current) => {
      const next: Record<string, DeviceReachability> = {};
      for (const [deviceId, reachability] of Object.entries(current)) {
        if (onlineDeviceIds.has(deviceId)) {
          next[deviceId] = reachability;
        }
      }
      return next;
    });

    for (const device of devices) {
      const probeKey = `${device.address}:${device.port}:${device.trustFingerprint}`;
      const previousKey = probeKeyByDeviceIdRef.current.get(device.deviceId);
      const previousReachability = reachabilityByDeviceId[device.deviceId];
      if (previousKey === probeKey && previousReachability) {
        continue;
      }

      probeKeyByDeviceIdRef.current.set(device.deviceId, probeKey);
      setReachabilityByDeviceId((current) => ({
        ...current,
        [device.deviceId]: {
          deviceId: device.deviceId,
          status: 'checking',
          checkedAt: Date.now()
        }
      }));

      void window.syncFile.probeDevice(device.deviceId).then((reachability) => {
        if (!active) {
          return;
        }
        setReachabilityByDeviceId((current) => ({
          ...current,
          [device.deviceId]: reachability
        }));
      });
    }

    return () => {
      active = false;
    };
  }, [devices, reachabilityByDeviceId]);

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
    if (!isSettingsOpen) {
      return;
    }
  }, [isSettingsOpen]);

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
          setRequestsInboxTab('files');
          setActiveSection('inbox');
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
          setRequestsInboxTab('pairs');
          setActiveSection('inbox');
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
      if (activeSection !== 'inbox' || document.visibilityState !== 'visible' || !document.hasFocus()) {
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
  }, [activeSection, selectedIncomingOfferId, selectedPairRequestId]);

  useEffect(() => {
    const trackedStatuses = new Set(['completed', 'failed', 'rejected', 'cancelled']);
    for (const transfer of transfers) {
      const previousStatus = lastTransferNotificationStatusRef.current.get(transfer.transferId);
      if (previousStatus === undefined) {
        lastTransferNotificationStatusRef.current.set(transfer.transferId, transfer.status);
        continue;
      }
      if (previousStatus === transfer.status) {
        continue;
      }
      lastTransferNotificationStatusRef.current.set(transfer.transferId, transfer.status);
      if (!trackedStatuses.has(transfer.status)) {
        continue;
      }

      if (isCompactLayout) {
        setActiveSection('ledger');
      }

      if (transfer.status === 'completed') {
        maybeShowDesktopNotification(
          desktopNotificationsEnabled,
          messages.notificationTransferCompleteTitle,
          messages.notificationTransferCompleteBody(transfer.fileName),
          () => {
            setSelectedTransferId(transfer.transferId);
            if (isCompactLayout) {
              setActiveSection('ledger');
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
              setActiveSection('ledger');
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
      localStorage.setItem(THEME_KEY, 'dark');
    } else {
      root.setAttribute('data-theme', 'light');
      localStorage.setItem(THEME_KEY, 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem(
      SEND_DRAFT_KEY,
      JSON.stringify({
        selectedDeviceIds,
        selectedRecipientSnapshots: Object.fromEntries(
          Object.entries(selectedRecipientSnapshots).map(([deviceId, device]) => [
            deviceId,
            compactRecipientSnapshot(device)
          ])
        ),
        pendingSendFiles
      })
    );
  }, [pendingSendFiles, selectedDeviceIds, selectedRecipientSnapshots]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => {
      setNotice(null);
    }, notice.kind === 'warn' ? 5200 : 3600);

    return () => window.clearTimeout(timer);
  }, [notice]);

  async function handleSendFiles(filePaths: string[]): Promise<void> {
    setNotice(null);
    const targetDeviceIds = selectedDevices
      .filter((device) => device.isOnline && device.reachability !== 'unreachable')
      .map((device) => device.deviceId);
    if (targetDeviceIds.length === 0) {
      setNotice({
        kind: 'warn',
        message: messages.sendQueueUnavailable(selectedDevices.length)
      });
      return;
    }
    const skippedCount = selectedDevices.length - targetDeviceIds.length;
    const batchMeta =
      targetDeviceIds.length * filePaths.length > 1
        ? {
            batchId: crypto.randomUUID(),
            batchLabel: messages.sendDraftSummary(filePaths.length, targetDeviceIds.length)
          }
        : undefined;
    const successfulDeviceIds = new Set<string>();

    for (const deviceId of targetDeviceIds) {
      let deviceSucceeded = true;
      for (const filePath of filePaths) {
        try {
          await sendFile(deviceId, filePath, undefined, batchMeta);
        } catch {
          // Hook already stores and exposes the error message.
          deviceSucceeded = false;
        }
      }

      if (deviceSucceeded) {
        successfulDeviceIds.add(deviceId);
      }
    }

    if (successfulDeviceIds.size === targetDeviceIds.length) {
      setPendingSendFiles([]);
      setSelectedDeviceIds((current) => current.filter((deviceId) => !successfulDeviceIds.has(deviceId)));
      setSelectedRecipientSnapshots((current) => {
        const next = { ...current };
        for (const deviceId of successfulDeviceIds) {
          delete next[deviceId];
        }
        return next;
      });
      setNotice({
        kind: 'info',
        message: messages.sendQueueStarted(filePaths.length, successfulDeviceIds.size)
      });
    } else if (successfulDeviceIds.size > 0) {
      setSelectedDeviceIds((current) => current.filter((deviceId) => !successfulDeviceIds.has(deviceId)));
      setSelectedRecipientSnapshots((current) => {
        const next = { ...current };
        for (const deviceId of successfulDeviceIds) {
          delete next[deviceId];
        }
        return next;
      });
      setNotice({
        kind: 'warn',
        message: messages.sendQueuePartial(
          successfulDeviceIds.size,
          targetDeviceIds.length - successfulDeviceIds.size,
          skippedCount
        )
      });
    } else {
      setNotice({
        kind: 'warn',
        message: messages.sendQueuePartial(0, targetDeviceIds.length, skippedCount)
      });
    }

    if (isCompactLayout) {
      setActiveSection('ledger');
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

  async function refreshRuntimeLogs(): Promise<void> {
    try {
      setRuntimeLogEntries(await window.syncFile.getRuntimeLogs());
    } catch {
      // Logs are diagnostic only.
    }
  }

  async function handleClearRuntimeLogs(): Promise<void> {
    try {
      await window.syncFile.clearRuntimeLogs();
      await refreshRuntimeLogs();
    } catch {
      // Logs are diagnostic only.
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
      await refreshDevices();
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

  const unreadRequestCount = unreadOfferIds.size + unreadPairRequestIds.size;
  const reachableDeviceCount = useMemo(
    () =>
      devices.filter((device) => reachabilityByDeviceId[device.deviceId]?.status === 'reachable').length,
    [devices, reachabilityByDeviceId]
  );
  const activeTransferCount = useMemo(
    () => transfers.filter((item) => ['pending', 'in-progress', 'paused'].includes(item.status)).length,
    [transfers]
  );
  const issueTransferCount = useMemo(
    () => transfers.filter((item) => ['failed', 'rejected', 'cancelled'].includes(item.status)).length,
    [transfers]
  );
  const completedTransferCount = useMemo(
    () => transfers.filter((item) => item.status === 'completed').length,
    [transfers]
  );
  const pendingRequestCount = pendingOffers.length + pendingPairRequests.length;

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

  const handleToggleDeviceSelection = (deviceId: string): void => {
    setFocusedDeviceId(deviceId);
    const device = devices.find((item) => item.deviceId === deviceId);
    if (device) {
      setSelectedRecipientSnapshots((current) => ({
        ...current,
        [deviceId]: device
      }));
    }
    setSelectedDeviceIds((current) =>
      current.includes(deviceId) ? current.filter((id) => id !== deviceId) : [...current, deviceId]
    );
    setActiveSection('dispatch');
  };

  const handleRemoveRecipient = (deviceId: string): void => {
    setSelectedDeviceIds((current) => current.filter((id) => id !== deviceId));
    setSelectedRecipientSnapshots((current) => {
      const next = { ...current };
      delete next[deviceId];
      return next;
    });
  };

  const handleOpenRequestsInbox = (): void => {
    const unreadOfferId = pendingOffers.find((offer) => unreadOfferIds.has(offer.offerId))?.offerId;
    if (unreadOfferId) {
      setSelectedIncomingOfferId(unreadOfferId);
      setRequestsInboxTab('files');
      setActiveSection('inbox');
      return;
    }

    const unreadPairRequestId = pendingPairRequests.find((request) => unreadPairRequestIds.has(request.requestId))?.requestId;
    if (unreadPairRequestId) {
      setSelectedPairRequestId(unreadPairRequestId);
      setRequestsInboxTab('pairs');
      setActiveSection('inbox');
      return;
    }

    if (pendingOffers[0]) {
      setSelectedIncomingOfferId(pendingOffers[0].offerId);
      setRequestsInboxTab('files');
      setActiveSection('inbox');
      return;
    }

    if (pendingPairRequests[0]) {
      setSelectedPairRequestId(pendingPairRequests[0].requestId);
      setRequestsInboxTab('pairs');
      setActiveSection('inbox');
      return;
    }

    setRequestsInboxTab('files');
    setActiveSection('inbox');
  };

  const handleWorkspaceSectionChange = (section: WorkspaceSection): void => {
    setActiveSection(section);
    if (section === 'ledger' && transfers[0]) {
      setSelectedTransferId(transfers[0].transferId);
    }
  };

  const showManifest = activeSection === 'manifest';
  const showDispatch = activeSection === 'dispatch';
  const showLedger = activeSection === 'ledger';
  const showInbox = activeSection === 'inbox';
  const activeSendTransfers = useMemo(
    () =>
      transfers.filter(
        (item) => item.direction === 'send' && ['pending', 'in-progress'].includes(item.status)
      ),
    [transfers]
  );
  const primaryActiveSendTransfer = activeSendTransfers[0] ?? null;
  const primaryActiveSendPercent = primaryActiveSendTransfer
    ? progressPercent(
        primaryActiveSendTransfer.fileSize,
        primaryActiveSendTransfer.bytesTransferred,
        primaryActiveSendTransfer.status
      )
    : 0;
  const sendDraftSummary =
    pendingSendFiles.length > 0
      ? messages.sendDraftSummary(pendingSendFiles.length, selectedDevices.length)
      : selectedDevices.length > 0
        ? messages.recipientSelectionSummary(selectedDevices.length)
        : messages.routeMetaIdle;
  const statusHeadline = primaryActiveSendTransfer
    ? primaryActiveSendTransfer.fileName
    : pendingRequestCount > 0
      ? messages.requestsInbox
      : selectedDevices.length > 0
        ? sendDraftSummary
        : messages.routeMetaIdle;
  const statusDetail = primaryActiveSendTransfer
    ? `${primaryActiveSendPercent}% · ${primaryActiveSendTransfer.peerDeviceName || messages.unknownDevice}`
    : messages.sidebarStatusDetail(pendingOffers.length, pendingPairRequests.length, activeTransferCount);

  return (
    <div className="app-shell">
      <AppSidebar
        messages={messages}
        locale={locale}
        setLocale={setLocale}
        selfDevice={selfDevice}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed((value) => !value)}
        activeSection={activeSection}
        onSectionChange={handleWorkspaceSectionChange}
        statusHeadline={statusHeadline}
        statusDetail={statusDetail}
        liveProgressPercent={primaryActiveSendPercent}
        reachableDeviceCount={reachableDeviceCount}
        deviceCount={devices.length}
        pendingFileCount={pendingSendFiles.length}
        selectedRecipientCount={selectedDevices.length}
        activeSendTransferCount={activeSendTransfers.length}
        completedTransferCount={completedTransferCount}
        issueTransferCount={issueTransferCount}
        activeTransferCount={activeTransferCount}
        pendingRequestCount={pendingRequestCount}
        unreadRequestCount={unreadRequestCount}
        isDarkMode={isDarkMode}
        onOpenRequestsInbox={handleOpenRequestsInbox}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenLogs={() => {
          setIsLogViewerOpen(true);
          void refreshRuntimeLogs();
        }}
        onOpenSandbox={() => void handleOpenSandbox()}
        onToggleTheme={() => setIsDarkMode((prev) => !prev)}
      />

      <div className="workspace-main">
        <WorkspaceHeader
          messages={messages}
          activeSection={activeSection}
          deviceCount={devices.length}
          pendingFileCount={pendingSendFiles.length}
          selectedRecipientCount={selectedDevices.length}
          activeTransferCount={activeTransferCount}
          pendingRequestCount={pendingRequestCount}
        />
        {errorMessage && (
          <div className="error-banner" role="alert">
            <span>{errorMessage}</span>
            <button type="button" className="button button-ghost" onClick={clearError}>
              {messages.dismiss}
            </button>
          </div>
        )}
        {notice && (
          <div className={`notice-banner is-${notice.kind}`} role="status">
            <span>{notice.message}</span>
            <button type="button" className="button button-ghost" onClick={() => setNotice(null)}>
              {messages.dismiss}
            </button>
          </div>
        )}

        <main
          className={`content-grid is-menu-layout is-active-${activeSection}`}
        >
          {showManifest && (
            <ManifestPanel
              messages={messages}
              devices={devices}
              selectedDeviceIds={selectedDeviceIds}
              focusedDeviceId={focusedDeviceId}
              reachabilityByDeviceId={reachabilityByDeviceId}
              trustedDeviceKeys={trustedDeviceKeys}
              reachableDeviceCount={reachableDeviceCount}
              isRefreshingDevices={isRefreshingDevices}
              onToggleDeviceSelection={handleToggleDeviceSelection}
              onFocusDevice={setFocusedDeviceId}
              onRefreshDevices={handleRefreshDevices}
            />
          )}

          {showDispatch && (
            <DispatchPanel
              messages={messages}
              selectedDevices={selectedDevices}
              trustedDeviceKeys={trustedDeviceKeys}
              pendingFiles={pendingSendFiles}
              activeSendTransfers={activeSendTransfers}
              primaryActiveSendTransfer={primaryActiveSendTransfer}
              primaryActiveSendPercent={primaryActiveSendPercent}
              selfDevice={selfDevice}
              onPairDevice={setPairingDeviceId}
              onSendFiles={(filePaths) => void handleSendFiles(filePaths)}
              onPendingFilesChange={setPendingSendFiles}
              onRemoveRecipient={handleRemoveRecipient}
            />
          )}

          {showLedger && (
            <LedgerPanel
              messages={messages}
              transfers={transfers}
              activeTransferCount={activeTransferCount}
              issueTransferCount={issueTransferCount}
              busyTransferIds={busyTransferIds}
              selectedTransferId={selectedTransferId}
              onSelectedTransferIdChange={setSelectedTransferId}
              onPause={handlePauseTransfer}
              onCancel={handleCancelTransfer}
              onRetry={handleRetryTransfer}
              onClearTransfers={handleClearTransfers}
            />
          )}

          {showInbox && (
            <RequestsInboxPanel
              activeTab={requestsInboxTab}
              onTabChange={setRequestsInboxTab}
              offers={pendingOffers}
              selectedOfferId={selectedIncomingOfferId}
              trustedDeviceKeys={trustedDeviceKeys}
              busyOfferId={busyOfferId}
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
              onAccept={handleAccept}
              onTrustAndAccept={handleTrustAndAccept}
              onReject={handleReject}
              pairRequests={pendingPairRequests}
              selectedPairRequestId={selectedPairRequestId}
              selfFingerprint={selfDevice?.trustFingerprint}
              onSelectPairRequest={(requestId) => {
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
              onAcceptPairRequest={handleAcceptPairRequest}
              onRejectPairRequest={handleRejectPairRequest}
              messages={messages}
            />
          )}
        </main>
      </div>

      {pairingDevice && selfDevice && (
        <PairDevicePrompt
          device={pairingDevice}
          selfFingerprint={selfDevice.trustFingerprint}
          onConfirm={handlePairDevice}
          onClose={() => setPairingDeviceId(null)}
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
      {isLogViewerOpen && (
        <LogViewer
          entries={runtimeLogEntries}
          messages={messages}
          onRefresh={refreshRuntimeLogs}
          onClear={handleClearRuntimeLogs}
          onClose={() => setIsLogViewerOpen(false)}
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
