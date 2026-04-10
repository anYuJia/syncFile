import { useEffect, useState } from 'react';

import type {
  Device,
  IncomingOffer,
  RejectReason,
  TransferId,
  TransferProgress
} from '@shared/types';

interface TransferWithTimestamp extends TransferProgress {
  updatedAt: number;
}

interface UseSyncFileResult {
  selfDevice: Device | null;
  devices: Device[];
  pendingOffers: IncomingOffer[];
  transfers: TransferProgress[];
  isLoading: boolean;
  errorMessage: string | null;
  clearError: () => void;
  sendFile: (deviceId: string, filePath: string) => Promise<TransferId>;
  acceptOffer: (offerId: string) => Promise<void>;
  rejectOffer: (offerId: string, reason?: RejectReason) => Promise<void>;
  openSandbox: () => Promise<void>;
}

function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  if (index < 0) {
    return normalized;
  }
  return normalized.slice(index + 1);
}

function buildTransferFromEvent(
  previous: TransferWithTimestamp | undefined,
  incoming: TransferProgress
): TransferWithTimestamp {
  const fallbackFileName = previous?.fileName ?? 'unknown-file';
  const fallbackFileSize = previous?.fileSize ?? 0;
  const fallbackPeerDeviceName = previous?.peerDeviceName ?? 'Unknown device';

  return {
    transferId: incoming.transferId,
    direction: incoming.direction ?? previous?.direction ?? 'send',
    fileName: incoming.fileName || fallbackFileName,
    fileSize: incoming.fileSize > 0 ? incoming.fileSize : fallbackFileSize,
    bytesTransferred:
      incoming.bytesTransferred >= 0 ? incoming.bytesTransferred : previous?.bytesTransferred ?? 0,
    peerDeviceName: incoming.peerDeviceName || fallbackPeerDeviceName,
    status: incoming.status ?? previous?.status ?? 'pending',
    error: incoming.error ?? previous?.error,
    updatedAt: Date.now()
  };
}

export function useSyncFile(): UseSyncFileResult {
  const [selfDevice, setSelfDevice] = useState<Device | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [pendingOffers, setPendingOffers] = useState<IncomingOffer[]>([]);
  const [transferMap, setTransferMap] = useState<Record<string, TransferWithTimestamp>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const init = async (): Promise<void> => {
      try {
        const [self, list] = await Promise.all([
          window.syncFile.getSelfDevice(),
          window.syncFile.getDevices()
        ]);
        if (!active) {
          return;
        }
        setSelfDevice(self);
        setDevices(list);
      } catch (error) {
        if (!active) {
          return;
        }
        setErrorMessage((error as Error).message || 'Failed to load device information.');
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void init();

    const offOnline = window.syncFile.onDeviceOnline((device) => {
      setDevices((prev) => {
        const existed = prev.some((item) => item.deviceId === device.deviceId);
        if (existed) {
          return prev.map((item) => (item.deviceId === device.deviceId ? device : item));
        }
        return [...prev, device];
      });
    });

    const offOffline = window.syncFile.onDeviceOffline((deviceId) => {
      setDevices((prev) => prev.filter((item) => item.deviceId !== deviceId));
    });

    const offIncomingOffer = window.syncFile.onIncomingOffer((offer) => {
      setPendingOffers((prev) => [...prev, offer]);
    });

    const applyTransferEvent = (progress: TransferProgress): void => {
      setTransferMap((prev) => {
        const next = { ...prev };
        next[progress.transferId] = buildTransferFromEvent(prev[progress.transferId], progress);
        return next;
      });
    };

    const offTransferProgress = window.syncFile.onTransferProgress((progress) => {
      applyTransferEvent(progress);
    });

    const offTransferComplete = window.syncFile.onTransferComplete((progress) => {
      applyTransferEvent(progress);
    });

    return () => {
      active = false;
      offOnline();
      offOffline();
      offIncomingOffer();
      offTransferProgress();
      offTransferComplete();
    };
  }, []);

  const transfers = Object.values(transferMap).sort((a, b) => b.updatedAt - a.updatedAt);

  async function sendFile(deviceId: string, filePath: string): Promise<TransferId> {
    try {
      const transferId = await window.syncFile.sendFile(deviceId, filePath);
      const target = devices.find((device) => device.deviceId === deviceId);
      setTransferMap((prev) => {
        if (prev[transferId.value]) {
          return prev;
        }

        return {
          ...prev,
          [transferId.value]: {
            transferId: transferId.value,
            direction: 'send',
            fileName: basename(filePath),
            fileSize: 0,
            bytesTransferred: 0,
            peerDeviceName: target?.name ?? 'Unknown device',
            status: 'pending',
            updatedAt: Date.now()
          }
        };
      });
      return transferId;
    } catch (error) {
      setErrorMessage((error as Error).message || 'Send failed.');
      throw error;
    }
  }

  async function acceptOffer(offerId: string): Promise<void> {
    try {
      await window.syncFile.acceptIncoming(offerId);
      setPendingOffers((prev) => prev.filter((offer) => offer.offerId !== offerId));
    } catch (error) {
      setErrorMessage((error as Error).message || 'Failed to accept incoming file.');
      throw error;
    }
  }

  async function rejectOffer(offerId: string, reason: RejectReason = 'user-declined'): Promise<void> {
    try {
      await window.syncFile.rejectIncoming(offerId, reason);
      setPendingOffers((prev) => prev.filter((offer) => offer.offerId !== offerId));
    } catch (error) {
      setErrorMessage((error as Error).message || 'Failed to reject incoming file.');
      throw error;
    }
  }

  async function openSandbox(): Promise<void> {
    try {
      await window.syncFile.openSandbox();
    } catch (error) {
      setErrorMessage((error as Error).message || 'Unable to open sandbox folder.');
      throw error;
    }
  }

  return {
    selfDevice,
    devices,
    pendingOffers,
    transfers,
    isLoading,
    errorMessage,
    clearError: () => setErrorMessage(null),
    sendFile,
    acceptOffer,
    rejectOffer,
    openSandbox
  };
}
