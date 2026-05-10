import { startTransition, useEffect, useMemo, useRef, useState } from 'react';

import type {
  Device,
  IncomingOffer,
  RejectReason,
  TransferId,
  TransferProgress,
  TransferRecord
} from '@shared/types';
import type { Messages } from '../i18n';
import { deriveTransferTelemetry, refreshTransferTelemetry } from '../utils/transfer-metrics';

export interface RendererTransferProgress extends TransferProgress {
  updatedAt: number;
  transferRateBytesPerSecond?: number;
  estimatedSecondsRemaining?: number;
  lastByteSampleAt?: number;
  lastByteSampleBytes?: number;
  lastProgressAt?: number;
}

interface UseSyncFileResult {
  selfDevice: Device | null;
  devices: Device[];
  pendingOffers: IncomingOffer[];
  transfers: RendererTransferProgress[];
  isLoading: boolean;
  errorMessage: string | null;
  clearError: () => void;
  refreshDevices: () => Promise<Device[]>;
  sendFile: (
    deviceId: string,
    filePath: string,
    existingTransferId?: string,
    batchMeta?: { batchId?: string; batchLabel?: string }
  ) => Promise<TransferId>;
  pauseTransfer: (transferId: string) => Promise<void>;
  cancelTransfer: (transferId: string) => Promise<void>;
  retryTransfer: (transferId: string) => Promise<TransferId>;
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
  previous: RendererTransferProgress | undefined,
  incoming: TransferProgress,
  now = Date.now(),
  fallbackPeerName = ''
): RendererTransferProgress {
  const eventTime = typeof incoming.updatedAt === 'number' ? incoming.updatedAt : now;
  const nextDirection = incoming.direction ?? previous?.direction ?? 'send';
  const nextFileName = incoming.fileName || previous?.fileName || 'unknown-file';
  const nextFileSize = incoming.fileSize > 0 ? incoming.fileSize : previous?.fileSize ?? 0;
  const nextBytesTransferred =
    incoming.bytesTransferred >= 0 ? incoming.bytesTransferred : previous?.bytesTransferred ?? 0;
  const nextPeerName = incoming.peerDeviceName || previous?.peerDeviceName || fallbackPeerName;
  const nextPeerId = incoming.peerDeviceId || previous?.peerDeviceId || '';
  const nextStatus = incoming.status ?? previous?.status ?? 'pending';
  const nextError =
    incoming.error !== undefined
      ? incoming.error
      : ['failed', 'rejected', 'cancelled', 'paused'].includes(nextStatus)
        ? previous?.error
        : undefined;
  const telemetry = deriveTransferTelemetry(
    previous,
    {
      status: nextStatus,
      fileSize: nextFileSize,
      bytesTransferred: nextBytesTransferred
    },
    eventTime
  );

  return {
    transferId: incoming.transferId,
    batchId: incoming.batchId ?? previous?.batchId,
    batchLabel: incoming.batchLabel ?? previous?.batchLabel,
    direction: nextDirection,
    fileName: nextFileName,
    fileSize: nextFileSize,
    bytesTransferred: nextBytesTransferred,
    peerDeviceName: nextPeerName,
    peerDeviceId: nextPeerId,
    status: nextStatus,
    receiveMode: incoming.receiveMode ?? previous?.receiveMode,
    localPath: incoming.localPath ?? previous?.localPath,
    sourceFileModifiedAt: incoming.sourceFileModifiedAt ?? previous?.sourceFileModifiedAt,
    sourceFileSha256: incoming.sourceFileSha256 ?? previous?.sourceFileSha256,
    error: nextError,
    updatedAt: eventTime,
    ...telemetry,
    transferRateBytesPerSecond: incoming.transferRateBytesPerSecond ?? telemetry.transferRateBytesPerSecond,
    estimatedSecondsRemaining: incoming.estimatedSecondsRemaining ?? telemetry.estimatedSecondsRemaining
  };
}

function buildTransferMap(records: TransferRecord[]): Map<string, RendererTransferProgress> {
  const map = new Map<string, RendererTransferProgress>();
  for (const record of records) {
    map.set(record.transferId, {
      ...record,
      updatedAt: record.updatedAt
    });
  }
  return map;
}

function upsertOffer(offers: IncomingOffer[], offer: IncomingOffer): IncomingOffer[] {
  const existingIndex = offers.findIndex((item) => item.offerId === offer.offerId);
  if (existingIndex >= 0) {
    const next = [...offers];
    next[existingIndex] = offer;
    return next;
  }
  return [offer, ...offers];
}

export function useSyncFile(messages: Messages): UseSyncFileResult {
  const [selfDevice, setSelfDevice] = useState<Device | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [pendingOffers, setPendingOffers] = useState<IncomingOffer[]>([]);
  const transferMapRef = useRef<Map<string, RendererTransferProgress>>(new Map());
  const offlineRemovalTimersRef = useRef<Map<string, number>>(new Map());
  const [transferVersion, setTransferVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    let active = true;

    const init = async (): Promise<void> => {
      try {
        const [self, list, history, pending] = await Promise.all([
          window.syncFile.getSelfDevice(),
          window.syncFile.getDevices(),
          window.syncFile.getTransferHistory(),
          window.syncFile.getPendingOffers()
        ]);
        if (!active) {
          return;
        }
        setSelfDevice(self);
        setDevices(list);
        transferMapRef.current = buildTransferMap(history);
        setTransferVersion((version) => version + 1);
        setPendingOffers(dedupeOffers(pending));
      } catch (error) {
        if (!active) {
          return;
        }
        const currentMessages = messagesRef.current;
        setErrorMessage(
          localizeError(error, currentMessages) || currentMessages.failedToLoadDeviceInformation
        );
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void init();

    const offOnline = window.syncFile.onDeviceOnline((device) => {
      const pendingTimer = offlineRemovalTimersRef.current.get(device.deviceId);
      if (pendingTimer !== undefined) {
        window.clearTimeout(pendingTimer);
        offlineRemovalTimersRef.current.delete(device.deviceId);
      }
      setDevices((prev) => {
        const existed = prev.some((item) => item.deviceId === device.deviceId);
        if (existed) {
          return prev.map((item) => (item.deviceId === device.deviceId ? device : item));
        }
        return [...prev, device];
      });
    });

    const offOffline = window.syncFile.onDeviceOffline((deviceId) => {
      const previousTimer = offlineRemovalTimersRef.current.get(deviceId);
      if (previousTimer !== undefined) {
        window.clearTimeout(previousTimer);
      }
      const timer = window.setTimeout(() => {
        offlineRemovalTimersRef.current.delete(deviceId);
        setDevices((prev) => prev.filter((item) => item.deviceId !== deviceId));
      }, 8000);
      offlineRemovalTimersRef.current.set(deviceId, timer);
    });

    const offIncomingOffer = window.syncFile.onIncomingOffer((offer) => {
      setPendingOffers((prev) => upsertOffer(prev, offer));
    });

    const offSelfDeviceUpdated = window.syncFile.onSelfDeviceUpdated((device) => {
      setSelfDevice(device);
    });

    const offTransferHistoryReset = window.syncFile.onTransferHistoryReset((items) => {
      transferMapRef.current = buildTransferMap(items);
      setTransferVersion((version) => version + 1);
    });

    const applyTransferEvent = (progress: TransferProgress): void => {
      const map = transferMapRef.current;
      map.set(
        progress.transferId,
        buildTransferFromEvent(map.get(progress.transferId), progress, Date.now(), messagesRef.current.unknownDevice)
      );
      setTransferVersion((version) => version + 1);
    };

    const offTransferProgress = window.syncFile.onTransferProgress((progress) => {
      startTransition(() => {
        applyTransferEvent(progress);
      });
    });

    const offTransferComplete = window.syncFile.onTransferComplete((progress) => {
      applyTransferEvent(progress);
    });

    return () => {
      active = false;
      offOnline();
      offOffline();
      offIncomingOffer();
      offSelfDeviceUpdated();
      offTransferHistoryReset();
      offTransferProgress();
      offTransferComplete();
      for (const timer of offlineRemovalTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      offlineRemovalTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      let changed = false;
      const now = Date.now();

      for (const [transferId, transfer] of transferMapRef.current.entries()) {
        const refreshed = refreshTransferTelemetry(transfer, now);
        if (refreshed !== transfer) {
          transferMapRef.current.set(transferId, refreshed);
          changed = true;
        }
      }

      if (changed) {
        setTransferVersion((version) => version + 1);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const transfers = useMemo(
    () =>
      [...transferMapRef.current.values()].sort((left, right) => right.updatedAt - left.updatedAt),
    [transferVersion]
  );

  async function sendFile(
    deviceId: string,
    filePath: string,
    existingTransferId?: string,
    batchMeta?: { batchId?: string; batchLabel?: string }
  ): Promise<TransferId> {
    try {
      const transferId = await window.syncFile.sendFile(deviceId, filePath, existingTransferId, batchMeta);
      const target = devices.find((device) => device.deviceId === deviceId);
      const previous = transferMapRef.current.get(transferId.value);
      const unknownDeviceName = messagesRef.current.unknownDevice;
      if (previous) {
        transferMapRef.current.set(transferId.value, {
          ...previous,
          batchId: previous.batchId ?? batchMeta?.batchId,
          batchLabel: previous.batchLabel ?? batchMeta?.batchLabel,
          localPath: previous.localPath ?? filePath,
          peerDeviceName:
            previous.peerDeviceName === unknownDeviceName || previous.peerDeviceName === 'Unknown device'
              ? target?.name ?? unknownDeviceName
              : previous.peerDeviceName,
          peerDeviceId: previous.peerDeviceId || target?.deviceId || deviceId
        });
      } else {
        transferMapRef.current.set(
          transferId.value,
          buildTransferFromEvent(undefined, {
            transferId: transferId.value,
            batchId: batchMeta?.batchId,
            batchLabel: batchMeta?.batchLabel,
            direction: 'send',
            fileName: basename(filePath),
            fileSize: 0,
            bytesTransferred: 0,
            peerDeviceName: target?.name ?? unknownDeviceName,
            peerDeviceId: target?.deviceId ?? deviceId,
            status: 'pending',
            localPath: filePath,
            sourceFileModifiedAt: undefined,
            sourceFileSha256: undefined
          })
        );
      }
      setTransferVersion((version) => version + 1);
      return transferId;
    } catch (error) {
      setErrorMessage(localizeError(error, messagesRef.current) || messagesRef.current.sendFailed);
      throw error;
    }
  }

  async function acceptOffer(offerId: string): Promise<void> {
    try {
      await window.syncFile.acceptIncoming(offerId);
      setPendingOffers((prev) => prev.filter((offer) => offer.offerId !== offerId));
    } catch (error) {
      setErrorMessage(
        localizeError(error, messagesRef.current) || messagesRef.current.failedToAcceptIncomingFile
      );
      throw error;
    }
  }

  async function pauseTransfer(transferId: string): Promise<void> {
    try {
      await window.syncFile.pauseTransfer(transferId);
    } catch (error) {
      setErrorMessage(localizeError(error, messagesRef.current) || messagesRef.current.sendFailed);
      throw error;
    }
  }

  async function cancelTransfer(transferId: string): Promise<void> {
    try {
      await window.syncFile.cancelTransfer(transferId);
    } catch (error) {
      setErrorMessage(localizeError(error, messagesRef.current) || messagesRef.current.sendFailed);
      throw error;
    }
  }

  async function retryTransfer(transferId: string): Promise<TransferId> {
    const transfer = transferMapRef.current.get(transferId);
    if (!transfer || transfer.direction !== 'send' || !transfer.localPath || !transfer.peerDeviceId) {
      throw new Error('transfer retry is not available');
    }
    return sendFile(transfer.peerDeviceId, transfer.localPath, transferId);
  }

  async function rejectOffer(offerId: string, reason: RejectReason = 'user-declined'): Promise<void> {
    try {
      await window.syncFile.rejectIncoming(offerId, reason);
      setPendingOffers((prev) => prev.filter((offer) => offer.offerId !== offerId));
    } catch (error) {
      setErrorMessage(
        localizeError(error, messagesRef.current) || messagesRef.current.failedToRejectIncomingFile
      );
      throw error;
    }
  }

  async function openSandbox(): Promise<void> {
    try {
      await window.syncFile.openSandbox();
    } catch (error) {
      setErrorMessage(localizeError(error, messagesRef.current) || messagesRef.current.failedToOpenSandbox);
      throw error;
    }
  }

  async function refreshDevices(): Promise<Device[]> {
    try {
      const list = await window.syncFile.refreshDevices();
      setDevices(list);
      return list;
    } catch (error) {
      setErrorMessage(
        localizeError(error, messagesRef.current) ||
          messagesRef.current.failedToLoadDeviceInformation
      );
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
    refreshDevices,
    sendFile,
    pauseTransfer,
    cancelTransfer,
    retryTransfer,
    acceptOffer,
    rejectOffer,
    openSandbox
  };
}

function dedupeOffers(offers: IncomingOffer[]): IncomingOffer[] {
  const byId = new Map<string, IncomingOffer>();
  for (const offer of offers) {
    byId.set(offer.offerId, offer);
  }
  return [...byId.values()].sort((left, right) => right.receivedAt - left.receivedAt);
}

function localizeError(error: unknown, messages: Messages): string | null {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : null;

  if (!message) {
    return null;
  }

  const normalizedMessage = message.toLowerCase();
  if (normalizedMessage.includes('device') && normalizedMessage.includes('not found')) {
    return messages.errorDeviceNotFound;
  }
  if (normalizedMessage.includes('offer') && normalizedMessage.includes('not found')) {
    return messages.errorOfferNotFound;
  }
  if (message.includes('peer declined transfer: too-large')) {
    return messages.errorPeerDeclinedTooLarge;
  }
  if (message.includes('peer declined transfer: identity-mismatch')) {
    return messages.errorPeerIdentityMismatch;
  }
  if (message.includes('source file changed')) {
    return messages.errorSourceFileChanged;
  }
  if (message.includes('ETIMEDOUT') || message.includes('connection timed out')) {
    return messages.errorConnectionTimedOut;
  }
  if (message.includes('peer did not respond in time')) {
    return messages.errorPeerNoResponse;
  }
  if (message.includes('peer closed connection before accepting')) {
    return messages.errorPeerClosedBeforeAccept;
  }
  if (message.includes('peer closed connection before transfer completed')) {
    return messages.errorPeerClosedBeforeComplete;
  }
  if (message.includes('socket closed before transfer completed')) {
    return messages.errorSocketClosedBeforeComplete;
  }
  if (message.includes('transfer timed out')) {
    return messages.errorTransferTimedOut;
  }
  if (message.includes('peer declined transfer')) {
    return messages.errorPeerDeclined;
  }

  return message;
}
