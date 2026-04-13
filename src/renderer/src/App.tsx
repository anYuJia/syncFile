import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { DeviceList } from './components/DeviceList';
import { DropZone } from './components/DropZone';
import { PairDevicePrompt } from './components/PairDevicePrompt';
import { ReceivePrompt } from './components/ReceivePrompt';
import { SettingsModal } from './components/Settings';
import { TransferList } from './components/TransferList';
import { useLocale } from './hooks/useLocale';
import { useSyncFile } from './hooks/useSyncFile';
import type { Device, IncomingOffer, PairRequest, TrustedDevice } from '@shared/types';

const RIGHT_PANE_SPLIT_KEY = 'syncfile.right-pane-manual-split-v3';
const MIN_RIGHT_PANE_SECTION_HEIGHT = 150;
const AUTO_DISPATCH_MIN_HEIGHT = 260;
const RIGHT_PANE_RESIZER_HEIGHT = 12;

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
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [pendingPairRequests, setPendingPairRequests] = useState<PairRequest[]>([]);
  const [pairingDeviceId, setPairingDeviceId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRefreshingDevices, setIsRefreshingDevices] = useState(false);
  const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);
  const [rightPaneSplit, setRightPaneSplit] = useState<number | null>(() => {
    const saved = localStorage.getItem(RIGHT_PANE_SPLIT_KEY);
    const parsed = saved ? Number(saved) : Number.NaN;
    return Number.isFinite(parsed) ? clamp(parsed, 0.25, 0.75) : null;
  });
  const [isResizingPanels, setIsResizingPanels] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const selectedDevice = devices.find((device) => device.deviceId === selectedDeviceId) ?? null;
  const pairingDevice = devices.find((device) => device.deviceId === pairingDeviceId) ?? null;
  const trustedDeviceKeys = new Set(
    trustedDevices.map((device) => `${device.deviceId}:${device.trustFingerprint}`)
  );

  useEffect(() => {
    void refreshTrustedDevices();
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
      return;
    }

    const selectedStillOnline = devices.some((item) => item.deviceId === selectedDeviceId);
    if (selectedStillOnline) {
      return;
    }

    setSelectedDeviceId(devices[0].deviceId);
  }, [devices, selectedDeviceId]);

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
    if (rightPaneSplit === null) {
      localStorage.removeItem(RIGHT_PANE_SPLIT_KEY);
      return;
    }

    localStorage.setItem(RIGHT_PANE_SPLIT_KEY, String(rightPaneSplit));
  }, [rightPaneSplit]);

  useEffect(() => {
    if (!isResizingPanels) {
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
      setIsResizingPanels(false);
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
  }, [isResizingPanels]);

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
  }

  async function handleAccept(offerId: string): Promise<void> {
    try {
      setBusyOfferId(offerId);
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
      await cancelTransfer(transferId);
    } catch {
      // Hook already stores and exposes the error message.
    }
  }

  async function handlePauseTransfer(transferId: string): Promise<void> {
    try {
      await pauseTransfer(transferId);
    } catch {
      // Hook already stores and exposes the error message.
    }
  }

  async function handleRetryTransfer(transferId: string): Promise<void> {
    try {
      await retryTransfer(transferId);
    } catch {
      // Hook already stores and exposes the error message.
    }
  }

  async function handleClearFinishedTransfers(): Promise<void> {
    try {
      await window.syncFile.clearTransferHistory();
    } catch {
      // Best effort only.
    }
  }

  async function refreshTrustedDevices(): Promise<void> {
    try {
      const currentSettings = await window.syncFile.getSettings();
      setTrustedDevices(currentSettings.trustedDevices);
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
      await refreshTrustedDevices();
      setPairingDeviceId(null);
    } catch {
      // Best effort; settings error remains in UI elsewhere.
    }
  }

  async function handleAcceptPairRequest(requestId: string): Promise<void> {
    try {
      await window.syncFile.acceptPairRequest(requestId);
      setPendingPairRequests((prev) => prev.filter((request) => request.requestId !== requestId));
      await refreshTrustedDevices();
    } catch {
      // Best effort only.
    }
  }

  async function handleRejectPairRequest(requestId: string): Promise<void> {
    try {
      await window.syncFile.rejectPairRequest(requestId);
      setPendingPairRequests((prev) => prev.filter((request) => request.requestId !== requestId));
    } catch {
      // Best effort only.
    }
  }

  const currentOffer = pendingOffers[0] ?? null;
  const currentPairRequest = pendingPairRequests[0] ?? null;
  const dispatchCardStyle =
    rightPaneSplit === null
      ? undefined
      : {
          flexBasis: `calc((100% - ${RIGHT_PANE_RESIZER_HEIGHT}px) * ${rightPaneSplit})`
        };

  const handlePaneResizerPointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    setIsResizingPanels(true);
  };

  const handlePaneResizerDoubleClick = (): void => {
    setRightPaneSplit(null);
  };

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
            {isDarkMode ? '☀️' : '🌙'}
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

      <main className={`content-grid${isResizingPanels ? ' is-resizing' : ''}`}>
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
            onSelect={(deviceId) => setSelectedDeviceId(deviceId)}
            messages={messages}
          />
        </section>

        <div
          ref={rightPaneRef}
          className={`right-pane${rightPaneSplit === null ? ' is-auto' : ''}`}
        >
          <section
            className="card card-dispatch"
            style={dispatchCardStyle}
          >
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

          <button
            type="button"
            className={`pane-resizer${isResizingPanels ? ' is-active' : ''}`}
            onPointerDown={handlePaneResizerPointerDown}
            onDoubleClick={handlePaneResizerDoubleClick}
            aria-label="Resize send and transfer panels"
          >
            <span className="pane-resizer-handle" aria-hidden="true" />
          </button>

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
              onClearFinished={handleClearFinishedTransfers}
            />
          </section>
        </div>
      </main>

      {currentOffer && (
        <ReceivePrompt
          offer={currentOffer}
          queueCount={pendingOffers.length}
          trustedSender={trustedDeviceKeys.has(
            `${currentOffer.fromDevice.deviceId}:${currentOffer.fromDevice.trustFingerprint}`
          )}
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
        <PairDevicePrompt
          device={{
            ...currentPairRequest.fromDevice,
            host: '',
            address: '',
            port: 0,
            platform: '',
            version: ''
          }}
          selfFingerprint={selfDevice.trustFingerprint}
          onConfirm={() => handleAcceptPairRequest(currentPairRequest.requestId)}
          onClose={() => void handleRejectPairRequest(currentPairRequest.requestId)}
          messages={messages}
        />
      )}
      {isSettingsOpen && (
        <SettingsModal
          messages={messages}
          onClose={() => {
            setIsSettingsOpen(false);
            void refreshTrustedDevices();
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
