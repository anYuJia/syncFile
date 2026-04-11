import { useEffect, useState } from 'react';

import { DeviceList } from './components/DeviceList';
import { DropZone } from './components/DropZone';
import { ReceivePrompt } from './components/ReceivePrompt';
import { SettingsModal } from './components/Settings';
import { TransferList } from './components/TransferList';
import { useLocale } from './hooks/useLocale';
import { useSyncFile } from './hooks/useSyncFile';

export function App(): JSX.Element {
  const { locale, messages, setLocale } = useLocale();
  const {
    selfDevice,
    devices,
    pendingOffers,
    transfers,
    errorMessage,
    clearError,
    sendFile,
    acceptOffer,
    rejectOffer,
    openSandbox
  } = useSyncFile(messages);

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const selectedDevice = devices.find((device) => device.deviceId === selectedDeviceId) ?? null;

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

  const currentOffer = pendingOffers[0] ?? null;

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

      <main className="content-grid">
        <section className="card card-manifest">
          <div className="card-head">
            <h2>{messages.onlineDevices}</h2>
            <span className="card-counter">{devices.length}</span>
          </div>
          <DeviceList
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelect={(deviceId) => setSelectedDeviceId(deviceId)}
            messages={messages}
          />
        </section>

        <section className="card card-dispatch">
          <div className="card-head">
            <h2>{messages.sendFile}</h2>
          </div>
          <DropZone
            onSend={(filePaths) => void handleSendFiles(filePaths)}
            messages={messages}
            selectedDeviceName={selectedDevice?.name ?? null}
            selfDeviceName={selfDevice?.name ?? null}
          />
        </section>

        <section className="card card-ledger">
          <div className="card-head">
            <h2>{messages.transferActivity}</h2>
          </div>
          <TransferList transfers={transfers} messages={messages} />
        </section>
      </main>

      {currentOffer && (
        <ReceivePrompt
          offer={currentOffer}
          queueCount={pendingOffers.length}
          busy={busyOfferId === currentOffer.offerId}
          onAccept={handleAccept}
          onReject={handleReject}
          messages={messages}
        />
      )}
      {isSettingsOpen && (
        <SettingsModal messages={messages} onClose={() => setIsSettingsOpen(false)} />
      )}
    </div>
  );
}
