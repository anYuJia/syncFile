import { randomUUID } from 'crypto';
import { basename, join, parse, resolve } from 'path';
import { accessSync, constants, mkdirSync, rmSync, statSync, writeFileSync } from 'fs';

import { BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron';

import { IpcChannels, type IpcChannel } from '../../shared/ipc-channels';
import type {
  Device,
  IncomingOffer,
  RejectReason,
  SandboxLocationInfo,
  Settings,
  SettingsPayload,
  TransferId,
  TransferRecord,
  TransferProgress
} from '../../shared/types';
import type { DeviceRegistry } from '../discovery/device-registry';
import type { MdnsService } from '../discovery/mdns-service';
import type { PendingOfferStore } from '../storage/pending-offers';
import type { SandboxLocationStore } from '../storage/sandbox-location';
import type { Sandbox } from '../storage/sandbox';
import type { SettingsStore } from '../storage/settings';
import type { TransferHistoryStore } from '../storage/transfer-history';
import type { DeviceIdentity } from '../storage/device-identity';
import type { TcpClient } from '../transfer/tcp-client';
import { sha256File } from '../transfer/file-hash';
import type {
  IncomingOfferInfo,
  OfferResponder,
  PairResponder,
  ReceiveInterruptedInfo,
  TcpServer,
  TransferErrorInfo
} from '../transfer/tcp-server';
import type { PairRequestMessage } from '../transfer/protocol';

const PROGRESS_THROTTLE_MS = 120;

interface OutboundTransferRequest {
  host: string;
  port: number;
  filePath: string;
  sha256: string;
}

export function sourceFileCanResume(
  previous: Partial<TransferProgress> | undefined,
  filePath: string,
  fileSize: number,
  modifiedAt: number
): boolean {
  if (!previous) {
    return true;
  }
  if (previous.direction !== 'send') {
    return true;
  }
  if (previous.localPath !== filePath) {
    return true;
  }
  if (typeof previous.sourceFileModifiedAt !== 'number') {
    return true;
  }
  return previous.fileSize === fileSize && previous.sourceFileModifiedAt === modifiedAt;
}

export function sourceFileHashCanResume(
  previous: Partial<TransferProgress> | undefined,
  filePath: string,
  fileSize: number,
  modifiedAt: number,
  sha256: string
): boolean {
  if (!previous) {
    return true;
  }
  if (previous.direction !== 'send') {
    return true;
  }
  if (previous.localPath !== filePath) {
    return false;
  }
  if (typeof previous.sourceFileSha256 === 'string' && previous.sourceFileSha256.length > 0) {
    return previous.sourceFileSha256 === sha256;
  }
  return sourceFileCanResume(previous, filePath, fileSize, modifiedAt);
}

function validateSandboxRoot(rootPath: string): string {
  const resolvedPath = resolve(rootPath);
  if (resolvedPath === parse(resolvedPath).root) {
    throw new Error('sandbox folder cannot be the filesystem root');
  }

  mkdirSync(resolvedPath, { recursive: true });
  const stats = statSync(resolvedPath);
  if (!stats.isDirectory()) {
    throw new Error('sandbox path must be a directory');
  }

  accessSync(resolvedPath, constants.R_OK | constants.W_OK);

  const probePath = join(resolvedPath, '.syncfile-write-test');
  writeFileSync(probePath, 'syncfile', 'utf8');
  rmSync(probePath, { force: true });

  return resolvedPath;
}

interface PendingOffer {
  info: IncomingOfferInfo;
  responder: OfferResponder;
}

interface PendingPairRequest {
  request: PairRequestMessage;
  responder: PairResponder;
}

type ReceiveMode = 'manual' | 'trusted-device' | 'auto-accept';

interface AcceptedInboundMeta {
  info: IncomingOfferInfo;
  receiveMode: ReceiveMode;
}

interface OutboundTransferMeta {
  transferId: string;
  fileName: string;
  fileSize: number;
  peerDeviceName: string;
  peerDeviceId: string;
  localPath: string;
  sourceFileModifiedAt: number;
  sourceFileSha256: string;
}

export interface IpcContext {
  registry: DeviceRegistry;
  mdnsService: MdnsService;
  tcpServer: TcpServer;
  tcpClient: TcpClient;
  sandbox: Sandbox;
  sandboxLocation: SandboxLocationStore;
  pendingOfferStore: PendingOfferStore;
  settingsStore: SettingsStore;
  transferHistoryStore: TransferHistoryStore;
  identity: DeviceIdentity;
  getSelfDevice: () => Device;
  getWindow: () => BrowserWindow | null;
}

export function registerIpcHandlers(context: IpcContext): void {
  const pendingOffers = new Map<string, PendingOffer>();
  const pendingPairRequests = new Map<string, PendingPairRequest>();
  const completedOrAcceptedOffers = new Map<string, AcceptedInboundMeta>();
  const outboundTransfers = new Map<string, OutboundTransferMeta>();
  const outboundRequests = new Map<string, OutboundTransferRequest>();
  const queuedOutboundTransferIds: string[] = [];
  const cancellingOutboundTransfers = new Set<string>();
  const pausingOutboundTransfers = new Set<string>();
  const pendingProgressEvents = new Map<string, TransferProgress>();
  const progressTimers = new Map<string, NodeJS.Timeout>();
  let activeOutboundTransferId: string | null = null;

  const sendToRenderer = <T>(channel: IpcChannel, payload: T): void => {
    const window = context.getWindow();
    if (!window || window.isDestroyed()) return;
    window.webContents.send(channel, payload);
  };

  const emitTransferEvent = (
    channel: typeof IpcChannels.TransferProgress | typeof IpcChannels.TransferComplete,
    progress: TransferProgress
  ): void => {
    context.transferHistoryStore.upsert(progress);
    sendToRenderer(channel, progress);
  };

  const clearProgressTimer = (transferId: string): void => {
    const timer = progressTimers.get(transferId);
    if (timer) {
      clearTimeout(timer);
      progressTimers.delete(transferId);
    }
  };

  const flushProgressEvent = (transferId: string): void => {
    clearProgressTimer(transferId);
    const progress = pendingProgressEvents.get(transferId);
    if (!progress) {
      return;
    }
    pendingProgressEvents.delete(transferId);
    emitTransferEvent(IpcChannels.TransferProgress, progress);
  };

  const publishTransferEvent = (
    channel: typeof IpcChannels.TransferProgress | typeof IpcChannels.TransferComplete,
    progress: TransferProgress,
    immediate = channel === IpcChannels.TransferComplete || progress.status !== 'in-progress'
  ): void => {
    if (channel === IpcChannels.TransferComplete || immediate) {
      pendingProgressEvents.delete(progress.transferId);
      clearProgressTimer(progress.transferId);
      emitTransferEvent(channel, progress);
      return;
    }

    pendingProgressEvents.set(progress.transferId, progress);
    if (progressTimers.has(progress.transferId)) {
      return;
    }

    progressTimers.set(
      progress.transferId,
      setTimeout(() => {
        flushProgressEvent(progress.transferId);
      }, PROGRESS_THROTTLE_MS)
    );
  };

  const publishTransferHistoryReset = (): void => {
    sendToRenderer(IpcChannels.TransferHistoryReset, context.transferHistoryStore.list());
  };

  const makeOutboundProgress = (
    meta: OutboundTransferMeta,
    bytesTransferred: number,
    status: TransferProgress['status'],
    error?: string
  ): TransferProgress => ({
    transferId: meta.transferId,
    direction: 'send',
    fileName: meta.fileName,
    fileSize: meta.fileSize,
    bytesTransferred,
    peerDeviceName: meta.peerDeviceName,
    peerDeviceId: meta.peerDeviceId,
    localPath: meta.localPath,
    sourceFileModifiedAt: meta.sourceFileModifiedAt,
    sourceFileSha256: meta.sourceFileSha256,
    status,
    error
  });

  const makeInboundProgress = (
    offer: IncomingOfferInfo,
    bytesTransferred: number,
    status: TransferProgress['status'],
    receiveMode: ReceiveMode,
    localPath?: string,
    error?: string
  ): TransferProgress => ({
    transferId: offer.offerId,
    direction: 'receive',
    fileName: offer.fileName,
    fileSize: offer.fileSize,
    bytesTransferred,
    peerDeviceName: offer.fromDevice.name,
    peerDeviceId: offer.fromDevice.deviceId,
    localPath,
    status,
    receiveMode,
    error
  });

  const currentSandboxLocation = (): SandboxLocationInfo => ({
    path: context.sandbox.rootPath(),
    isCustom: context.sandboxLocation.currentPath() !== null,
    usageBytes: context.sandbox.currentUsageBytes()
  });

  const currentMaintenanceInfo = () => {
    const resumeCache = context.sandbox.resumeCacheSummary();
    return {
      transferHistoryCount: context.transferHistoryStore.count(),
      resumableTransferCount: resumeCache.count,
      resumableTransferBytes: resumeCache.bytes
    };
  };

  const sandboxLimitBytes = (settings: Settings): number => settings.maxSandboxSizeMB * 1024 * 1024;
  const autoAcceptLimitBytes = (settings: Settings): number => settings.autoAcceptMaxSizeMB * 1024 * 1024;

  const exceedsSandboxLimit = (fileSize: number, settings: Settings): boolean => {
    return context.sandbox.currentUsageBytes() + fileSize > sandboxLimitBytes(settings);
  };

  const lastTransferredBytes = (transferId: string): number => {
    return (
      pendingProgressEvents.get(transferId)?.bytesTransferred ??
      context.transferHistoryStore.get(transferId)?.bytesTransferred ??
      0
    );
  };

  const dequeueOutboundTransfer = (transferId: string): boolean => {
    const index = queuedOutboundTransferIds.indexOf(transferId);
    if (index < 0) {
      return false;
    }
    queuedOutboundTransferIds.splice(index, 1);
    return true;
  };

  const settleOutboundTransfer = (transferId: string): void => {
    pendingProgressEvents.delete(transferId);
    clearProgressTimer(transferId);
    outboundTransfers.delete(transferId);
    outboundRequests.delete(transferId);
    cancellingOutboundTransfers.delete(transferId);
    pausingOutboundTransfers.delete(transferId);
    if (activeOutboundTransferId === transferId) {
      activeOutboundTransferId = null;
    }
  };

  const startNextOutboundTransfer = (): void => {
    if (activeOutboundTransferId) {
      return;
    }

    const nextTransferId = queuedOutboundTransferIds.shift();
    if (!nextTransferId) {
      return;
    }

    const meta = outboundTransfers.get(nextTransferId);
    const request = outboundRequests.get(nextTransferId);
    if (!meta || !request) {
      settleOutboundTransfer(nextTransferId);
      startNextOutboundTransfer();
      return;
    }

    activeOutboundTransferId = nextTransferId;

    void context.tcpClient
      .sendFile({
        host: request.host,
        port: request.port,
        filePath: request.filePath,
        fileId: nextTransferId,
        sha256: request.sha256
      })
      .then(() => {
        const currentMeta = outboundTransfers.get(nextTransferId) ?? meta;
        publishTransferEvent(
          IpcChannels.TransferComplete,
          makeOutboundProgress(currentMeta, currentMeta.fileSize, 'completed')
        );
        settleOutboundTransfer(nextTransferId);
        startNextOutboundTransfer();
      })
      .catch((error: Error) => {
        const currentMeta = outboundTransfers.get(nextTransferId) ?? meta;
        const previousBytes = lastTransferredBytes(nextTransferId);
        const wasCancelled =
          cancellingOutboundTransfers.has(nextTransferId) || error.message.includes('transfer cancelled');
        const wasPaused =
          pausingOutboundTransfers.has(nextTransferId) || error.message.includes('transfer paused');

        if (wasCancelled) {
          publishTransferEvent(
            IpcChannels.TransferProgress,
            makeOutboundProgress(currentMeta, previousBytes, 'cancelled')
          );
          settleOutboundTransfer(nextTransferId);
          startNextOutboundTransfer();
          return;
        }

        if (wasPaused) {
          publishTransferEvent(
            IpcChannels.TransferProgress,
            makeOutboundProgress(currentMeta, previousBytes, 'paused')
          );
          settleOutboundTransfer(nextTransferId);
          startNextOutboundTransfer();
          return;
        }

        publishTransferEvent(
          IpcChannels.TransferProgress,
          makeOutboundProgress(currentMeta, previousBytes, 'failed', error.message)
        );
        settleOutboundTransfer(nextTransferId);
        startNextOutboundTransfer();
      });
  };

  const isTrustedDevice = (
    deviceId: string,
    trustFingerprint: string,
    trustPublicKey: string,
    settings: Settings
  ): boolean => {
    return settings.trustedDevices.some(
      (device) =>
        device.deviceId === deviceId &&
        device.trustFingerprint === trustFingerprint &&
        (device.trustPublicKey.length === 0 || device.trustPublicKey === trustPublicKey)
    );
  };

  const resolveReceiveMode = (info: IncomingOfferInfo, settings: Settings): ReceiveMode => {
    if (
      isTrustedDevice(
        info.fromDevice.deviceId,
        info.fromDevice.trustFingerprint,
        info.fromDevice.trustPublicKey,
        settings
      )
    ) {
      return 'trusted-device';
    }
    if (settings.autoAccept) {
      return 'auto-accept';
    }
    return 'manual';
  };

  const canAutoAcceptOffer = (info: IncomingOfferInfo, settings: Settings): boolean => {
    return (
      info.fileSize <= autoAcceptLimitBytes(settings) &&
      resolveReceiveMode(info, settings) !== 'manual'
    );
  };

  const upsertTrustedDevice = (
    device: { deviceId: string; name: string; trustFingerprint: string; trustPublicKey: string }
  ): Settings => {
    const current = context.settingsStore.get();
    const trustedDevices = [
      ...current.trustedDevices.filter(
        (item) =>
          !(item.deviceId === device.deviceId && item.trustFingerprint === device.trustFingerprint)
      ),
      {
        deviceId: device.deviceId,
        name: device.name,
        trustFingerprint: device.trustFingerprint,
        trustPublicKey: device.trustPublicKey,
        trustedAt: Date.now()
      }
    ].sort((a, b) => a.name.localeCompare(b.name));
    return context.settingsStore.save({ trustedDevices });
  };

  ipcMain.handle(IpcChannels.GetDevices, (): Device[] => {
    return context.registry.list();
  });

  ipcMain.handle(IpcChannels.RefreshDevices, (): Device[] => {
    context.mdnsService.refresh(true);
    return context.registry.list();
  });

  ipcMain.handle(IpcChannels.GetSelfDevice, (): Device => {
    return context.getSelfDevice();
  });

  ipcMain.handle(IpcChannels.GetTransferHistory, (): TransferRecord[] => {
    return context.transferHistoryStore.list();
  });

  ipcMain.handle(IpcChannels.PairDevice, async (_event, deviceId: string): Promise<void> => {
    const device = context.registry.list().find((candidate) => candidate.deviceId === deviceId);
    if (!device) {
      throw new Error(`device ${deviceId} not found`);
    }
    const accepted = await context.tcpClient.pairWithPeer(device.address, device.port);
    if (!accepted) {
      throw new Error('peer declined pairing');
    }
    upsertTrustedDevice(device);
  });

  ipcMain.handle(IpcChannels.AcceptPairRequest, (_event, requestId: string): void => {
    const pending = pendingPairRequests.get(requestId);
    if (!pending) {
      throw new Error(`pair request ${requestId} not found`);
    }
    upsertTrustedDevice(pending.request.fromDevice);
    pending.responder.accept();
    pendingPairRequests.delete(requestId);
  });

  ipcMain.handle(IpcChannels.RejectPairRequest, (_event, requestId: string): void => {
    const pending = pendingPairRequests.get(requestId);
    if (!pending) {
      throw new Error(`pair request ${requestId} not found`);
    }
    pending.responder.reject();
    pendingPairRequests.delete(requestId);
  });

  ipcMain.handle(IpcChannels.GetPendingOffers, (): IncomingOffer[] => {
    return context.pendingOfferStore.list();
  });

  ipcMain.handle(
    IpcChannels.SendFile,
    async (_event, deviceId: string, filePath: string, existingTransferId?: string): Promise<TransferId> => {
      const device = context.registry.list().find((candidate) => candidate.deviceId === deviceId);
      if (!device) {
        throw new Error(`device ${deviceId} not found`);
      }

      const transferId = existingTransferId ?? randomUUID();
      const fileName = basename(filePath);
      const fileStats = statSync(filePath);
      const fileSize = fileStats.size;
      const fileSha256 = await sha256File(filePath);
      if (existingTransferId) {
        const previous = context.transferHistoryStore.get(existingTransferId);
        if (!sourceFileHashCanResume(previous, filePath, fileSize, fileStats.mtimeMs, fileSha256)) {
          throw new Error('source file changed; cannot resume transfer');
        }
      }

      outboundTransfers.set(transferId, {
        transferId,
        fileName,
        fileSize,
        peerDeviceName: device.name,
        peerDeviceId: device.deviceId,
        localPath: filePath,
        sourceFileModifiedAt: fileStats.mtimeMs,
        sourceFileSha256: fileSha256
      });
      outboundRequests.set(transferId, {
        host: device.address,
        port: device.port,
        filePath,
        sha256: fileSha256
      });

      const meta = outboundTransfers.get(transferId)!;
      publishTransferEvent(
        IpcChannels.TransferProgress,
        makeOutboundProgress(meta, lastTransferredBytes(transferId), 'pending')
      );

      if (!queuedOutboundTransferIds.includes(transferId) && activeOutboundTransferId !== transferId) {
        queuedOutboundTransferIds.push(transferId);
      }
      startNextOutboundTransfer();

      return { value: transferId };
    }
  );

  ipcMain.handle(IpcChannels.PauseTransfer, (_event, transferId: string): void => {
    const outbound = outboundTransfers.get(transferId);
    if (!outbound) {
      throw new Error(`transfer ${transferId} not found`);
    }

    if (dequeueOutboundTransfer(transferId)) {
      publishTransferEvent(
        IpcChannels.TransferProgress,
        makeOutboundProgress(outbound, lastTransferredBytes(transferId), 'paused')
      );
      settleOutboundTransfer(transferId);
      startNextOutboundTransfer();
      return;
    }

    pausingOutboundTransfers.add(transferId);
    const paused = context.tcpClient.pause(transferId);
    if (!paused) {
      pausingOutboundTransfers.delete(transferId);
      throw new Error(`transfer ${transferId} not found`);
    }
  });

  ipcMain.handle(IpcChannels.CancelTransfer, (_event, transferId: string): void => {
    const outbound = outboundTransfers.get(transferId);
    if (outbound) {
      if (dequeueOutboundTransfer(transferId)) {
        publishTransferEvent(
          IpcChannels.TransferProgress,
          makeOutboundProgress(outbound, lastTransferredBytes(transferId), 'cancelled')
        );
        settleOutboundTransfer(transferId);
        startNextOutboundTransfer();
        return;
      }

      cancellingOutboundTransfers.add(transferId);
      const cancelled = context.tcpClient.cancel(transferId);
      if (!cancelled) {
        cancellingOutboundTransfers.delete(transferId);
        throw new Error(`transfer ${transferId} not found`);
      }
      return;
    }

    const inbound = completedOrAcceptedOffers.get(transferId);
    if (inbound) {
      const cancelled = context.tcpServer.cancel(transferId);
      if (!cancelled) {
        throw new Error(`transfer ${transferId} not found`);
      }
      return;
    }

    throw new Error(`transfer ${transferId} not found`);
  });

  ipcMain.handle(IpcChannels.AcceptIncoming, (_event, offerId: string): void => {
    const pending = pendingOffers.get(offerId);
    if (!pending) {
      throw new Error(`offer ${offerId} not found`);
    }
    const receiveMode = resolveReceiveMode(pending.info, context.settingsStore.get());
    completedOrAcceptedOffers.set(offerId, { info: pending.info, receiveMode });
    pending.responder.accept();
    pendingOffers.delete(offerId);
    context.pendingOfferStore.remove(offerId);
    publishTransferEvent(IpcChannels.TransferProgress, makeInboundProgress(pending.info, 0, 'pending', receiveMode));
  });

  ipcMain.handle(
    IpcChannels.RejectIncoming,
    (_event, offerId: string, reason: RejectReason = 'user-declined'): void => {
      const pending = pendingOffers.get(offerId);
      if (!pending) {
        throw new Error(`offer ${offerId} not found`);
      }
      pending.responder.reject(reason);
      pendingOffers.delete(offerId);
      context.pendingOfferStore.remove(offerId);
      publishTransferEvent(IpcChannels.TransferProgress, makeInboundProgress(pending.info, 0, 'rejected', 'manual'));
    }
  );

  ipcMain.handle(IpcChannels.OpenSandbox, async (): Promise<void> => {
    const result = await shell.openPath(context.sandbox.rootPath());
    if (result.length > 0) {
      throw new Error(result);
    }
  });

  ipcMain.handle(IpcChannels.OpenTransferPath, async (_event, path: string): Promise<void> => {
    const result = await shell.openPath(path);
    if (result.length > 0) {
      throw new Error(result);
    }
  });

  ipcMain.handle(IpcChannels.RevealTransferPath, (_event, path: string): void => {
    shell.showItemInFolder(path);
  });

  ipcMain.handle(IpcChannels.ClearTransferHistory, (): void => {
    const pausedReceiveIds = context.transferHistoryStore
      .list()
      .filter((record) => record.direction === 'receive' && record.status === 'paused')
      .map((record) => record.transferId);

    for (const transferId of pausedReceiveIds) {
      context.sandbox.discardIncomingResume(transferId, true);
    }

    context.transferHistoryStore.clearDismissible();
    publishTransferHistoryReset();
  });

  ipcMain.handle(IpcChannels.ClearResumeCache, (): void => {
    const activeReceiveIds = new Set(completedOrAcceptedOffers.keys());
    const clearedIds = context.sandbox.clearResumeCache(activeReceiveIds);
    for (const id of clearedIds) {
      context.transferHistoryStore.remove(id);
    }
    publishTransferHistoryReset();
  });

  ipcMain.handle(IpcChannels.GetSandboxLocation, (): SandboxLocationInfo => {
    return currentSandboxLocation();
  });

  ipcMain.handle(IpcChannels.ChooseSandboxLocation, async (): Promise<SandboxLocationInfo | null> => {
    const window = context.getWindow();
    const dialogOptions: OpenDialogOptions = {
      title: 'Select Sandbox Folder',
      buttonLabel: 'Use This Folder',
      properties: ['openDirectory', 'createDirectory', 'promptToCreate']
    };
    const selected = window
      ? await dialog.showOpenDialog(window, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (selected.canceled || selected.filePaths.length === 0) {
      return null;
    }

    const rootPath = context.sandboxLocation.save(validateSandboxRoot(selected.filePaths[0]));
    context.sandbox.setRoot(rootPath);
    return currentSandboxLocation();
  });

  ipcMain.handle(IpcChannels.SelectFile, async (): Promise<string | null> => {
    const window = context.getWindow();
    const dialogOptions: OpenDialogOptions = {
      title: 'Select File',
      properties: ['openFile']
    };
    const selected = window
      ? await dialog.showOpenDialog(window, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (selected.canceled || selected.filePaths.length === 0) {
      return null;
    }
    return selected.filePaths[0];
  });

  ipcMain.handle(IpcChannels.GetSettings, (): SettingsPayload => {
    return {
      ...context.settingsStore.get(),
      sandboxLocation: currentSandboxLocation(),
      maintenance: currentMaintenanceInfo()
    };
  });

  ipcMain.handle(IpcChannels.SaveSettings, (_event, partial: Partial<Settings>): Settings => {
    return context.settingsStore.save(partial);
  });

  context.registry.on('device-online', (device) => {
    sendToRenderer(IpcChannels.DeviceOnline, device);
  });

  context.registry.on('device-offline', (deviceId) => {
    sendToRenderer(IpcChannels.DeviceOffline, deviceId);
  });

  context.tcpServer.on('incoming-offer', (info, responder) => {
    const settings = context.settingsStore.get();
    if (exceedsSandboxLimit(info.fileSize, settings)) {
      responder.reject('too-large');
      publishTransferEvent(IpcChannels.TransferProgress, makeInboundProgress(info, 0, 'rejected', 'manual'));
      return;
    }

    if (canAutoAcceptOffer(info, settings)) {
      const receiveMode = resolveReceiveMode(info, settings);
      completedOrAcceptedOffers.set(info.offerId, { info, receiveMode });
      responder.accept();
      context.pendingOfferStore.remove(info.offerId);
      publishTransferEvent(IpcChannels.TransferProgress, makeInboundProgress(info, 0, 'pending', receiveMode));
      return;
    }

    pendingOffers.set(info.offerId, { info, responder });

    const offer: IncomingOffer = {
      offerId: info.offerId,
      fromDevice: info.fromDevice,
      fileName: info.fileName,
      fileSize: info.fileSize,
      mimeType: info.mimeType,
      receivedAt: Date.now(),
      saveDirectory: context.sandbox.directoryForIncoming(info.fromDevice.deviceId)
    };

    context.pendingOfferStore.upsert(offer);
    sendToRenderer(IpcChannels.IncomingOffer, offer);
  });

  context.tcpServer.on('pair-request', (request, responder) => {
    pendingPairRequests.set(request.requestId, { request, responder });
    sendToRenderer(IpcChannels.IncomingPairRequest, {
      requestId: request.requestId,
      fromDevice: request.fromDevice,
      receivedAt: Date.now()
    });
  });

  context.tcpServer.on('transfer-complete', (info) => {
    const meta = completedOrAcceptedOffers.get(info.offerId);
    const progress: TransferProgress = {
      transferId: info.offerId,
      direction: 'receive',
      fileName: meta?.info.fileName ?? basename(info.savedPath),
      fileSize: meta?.info.fileSize ?? info.bytesReceived,
      bytesTransferred: info.bytesReceived,
      peerDeviceName: info.fromDevice.name,
      peerDeviceId: info.fromDevice.deviceId,
      status: 'completed',
      receiveMode: meta?.receiveMode ?? 'manual',
      localPath: info.savedPath
    };

    completedOrAcceptedOffers.delete(info.offerId);
    publishTransferEvent(IpcChannels.TransferComplete, progress);

    if (context.settingsStore.get().openReceivedFolder) {
      shell.showItemInFolder(info.savedPath);
    }
  });

  context.tcpServer.on('progress', (info) => {
    const receiveMode = completedOrAcceptedOffers.get(info.offerId)?.receiveMode ?? 'manual';
    publishTransferEvent(
      IpcChannels.TransferProgress,
      makeInboundProgress(info, info.bytesReceived, 'in-progress', receiveMode)
    );
  });

  context.tcpServer.on('transfer-paused', (info: ReceiveInterruptedInfo) => {
    const receiveMode = completedOrAcceptedOffers.get(info.offerId)?.receiveMode ?? 'manual';
    publishTransferEvent(
      IpcChannels.TransferProgress,
      makeInboundProgress(
        info,
        info.bytesReceived,
        'paused',
        receiveMode,
        info.localPath,
        info.reason === 'sender-paused'
          ? 'Sender paused the transfer. Retry from the sender to continue.'
          : 'Transfer interrupted. Sender retry can resume from the cached partial file.'
      )
    );
    completedOrAcceptedOffers.delete(info.offerId);
  });

  context.tcpServer.on('transfer-cancelled', (info) => {
    const receiveMode = completedOrAcceptedOffers.get(info.offerId)?.receiveMode ?? 'manual';
    publishTransferEvent(
      IpcChannels.TransferProgress,
      makeInboundProgress(info, info.bytesReceived, 'cancelled', receiveMode)
    );
    completedOrAcceptedOffers.delete(info.offerId);
  });

  context.tcpServer.on('transfer-error', (info: TransferErrorInfo) => {
    if (info.offerId) {
      completedOrAcceptedOffers.delete(info.offerId);
    }
    publishTransferEvent(IpcChannels.TransferProgress, {
      transferId: info.offerId ?? randomUUID(),
      direction: 'receive',
      fileName: info.fileName ?? 'incoming file',
      fileSize: info.fileSize ?? 0,
      bytesTransferred: info.bytesReceived ?? 0,
      peerDeviceName: info.fromDevice?.name ?? '',
      peerDeviceId: info.fromDevice?.deviceId,
      status: 'failed',
      localPath: info.localPath,
      error: info.error.message
    } satisfies TransferProgress);
  });

  context.tcpClient.on('progress', (progress) => {
    const meta = outboundTransfers.get(progress.fileId);
    const fallbackMeta: OutboundTransferMeta = {
      transferId: progress.fileId,
      fileName: progress.fileName,
      fileSize: progress.totalBytes,
      peerDeviceName: meta?.peerDeviceName ?? '',
      peerDeviceId: meta?.peerDeviceId ?? '',
      localPath: meta?.localPath ?? '',
      sourceFileModifiedAt: meta?.sourceFileModifiedAt ?? 0,
      sourceFileSha256: meta?.sourceFileSha256 ?? ''
    };
    const currentMeta = meta ?? fallbackMeta;
    publishTransferEvent(
      IpcChannels.TransferProgress,
      makeOutboundProgress(
        currentMeta,
        progress.bytesTransferred,
        progress.bytesTransferred >= progress.totalBytes ? 'completed' : 'in-progress'
      )
    );
  });
}
