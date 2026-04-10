import { useEffect, useState } from 'react';

import { DeviceList } from './components/DeviceList';
import { DropZone } from './components/DropZone';
import { ReceivePrompt } from './components/ReceivePrompt';
import { TransferList } from './components/TransferList';
import { useSyncFile } from './hooks/useSyncFile';

export function App(): JSX.Element {
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
  } = useSyncFile();

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);

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
      <header className="topbar">
        <div>
          <h1 className="topbar-title">syncFile</h1>
          <p className="topbar-subtitle">
            {selfDevice ? `This device: ${selfDevice.name}` : isLoading ? 'Loading local device...' : 'Not ready'}
          </p>
        </div>
        <button type="button" className="button button-muted" onClick={() => void handleOpenSandbox()}>
          Open sandbox
        </button>
      </header>

      {errorMessage && (
        <div className="error-banner" role="alert">
          <span>{errorMessage}</span>
          <button type="button" className="button button-ghost" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}

      <main className="content-grid">
        <section className="card">
          <div className="card-head">
            <h2>Online devices</h2>
            <span>{devices.length}</span>
          </div>
          <DeviceList
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelect={(deviceId) => setSelectedDeviceId(deviceId)}
          />
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Send file</h2>
          </div>
          <DropZone onFileDropped={(filePath) => void handleFileDropped(filePath)} disabled={!selectedDeviceId} />
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Transfer activity</h2>
          </div>
          <TransferList transfers={transfers} />
        </section>
      </main>

      {currentOffer && (
        <ReceivePrompt
          offer={currentOffer}
          queueCount={pendingOffers.length}
          busy={busyOfferId === currentOffer.offerId}
          onAccept={handleAccept}
          onReject={handleReject}
        />
      )}
    </div>
  );
}
