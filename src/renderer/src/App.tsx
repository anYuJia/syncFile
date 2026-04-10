import { useEffect, useState } from 'react';

import { DeviceList } from './components/DeviceList';
import { DropZone } from './components/DropZone';
import { ReceivePrompt } from './components/ReceivePrompt';
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
    isLoading,
    errorMessage,
    clearError,
    sendFile,
    acceptOffer,
    rejectOffer,
    openSandbox
  } = useSyncFile(messages);

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const selectedDevice = devices.find((device) => device.deviceId === selectedDeviceId) ?? null;
  const currentRoute = selfDevice && selectedDevice
    ? messages.routeReady(selfDevice.name, selectedDevice.name)
    : messages.routeIdle;
  const currentRouteMeta = selectedDevice
    ? `${selectedDevice.address}:${selectedDevice.port}`
    : messages.routeMetaIdle;

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

  async function handleFileDropped(filePath: string): Promise<void> {
    const fallbackTarget = devices.length === 1 ? devices[0].deviceId : null;
    const targetDeviceId = selectedDeviceId ?? fallbackTarget;
    if (!targetDeviceId) {
      return;
    }
    try {
      await sendFile(targetDeviceId, filePath);
    } catch {
      // Hook already stores and exposes the error message.
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
      <div className="ambient-orbit ambient-orbit-left" aria-hidden="true" />
      <div className="ambient-orbit ambient-orbit-right" aria-hidden="true" />
      <header className="topbar">
        <div className="brand-block">
          <p className="topbar-kicker">{messages.heroEyebrow}</p>
          <div className="topbar-title-row">
            <h1 className="topbar-title">syncFile</h1>
            <span className="brand-stamp">{messages.heroStamp}</span>
          </div>
          <p className="topbar-subtitle">
            {selfDevice ? messages.heroLead : isLoading ? messages.loadingLocalDevice : messages.appNotReady}
          </p>
        </div>

        <div className="route-card">
          <span className="route-card-label">{messages.routeLabel}</span>
          <strong className="route-card-value">{currentRoute}</strong>
          <span className="route-card-meta">{currentRouteMeta}</span>
        </div>

        <div className="topbar-actions">
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
            <div>
              <p className="card-kicker">{messages.manifestKicker}</p>
              <h2>{messages.onlineDevices}</h2>
            </div>
            <span className="card-counter">{devices.length}</span>
          </div>
          <p className="card-note">{messages.manifestNote}</p>
          <DeviceList
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelect={(deviceId) => setSelectedDeviceId(deviceId)}
            messages={messages}
          />
        </section>

        <section className="card card-dispatch">
          <div className="card-head">
            <div>
              <p className="card-kicker">{messages.dispatchKicker}</p>
              <h2>{messages.sendFile}</h2>
            </div>
          </div>
          <p className="card-note">{messages.dispatchNote}</p>
          <DropZone
            onFileDropped={(filePath) => void handleFileDropped(filePath)}
            disabled={!selectedDeviceId}
            messages={messages}
            selectedDeviceName={selectedDevice?.name ?? null}
            selfDeviceName={selfDevice?.name ?? null}
          />
        </section>

        <section className="card card-ledger">
          <div className="card-head">
            <div>
              <p className="card-kicker">{messages.ledgerKicker}</p>
              <h2>{messages.transferActivity}</h2>
            </div>
          </div>
          <p className="card-note">{messages.ledgerNote}</p>
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
    </div>
  );
}
