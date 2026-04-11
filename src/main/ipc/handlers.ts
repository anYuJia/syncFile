import { randomUUID } from 'crypto';
import { basename } from 'path';
import { statSync } from 'fs';

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
import type { SandboxLocationStore } from '../storage/sandbox-location';
import type { Sandbox } from '../storage/sandbox';
import type { SettingsStore } from '../storage/settings';
import type { TransferHistoryStore } from '../storage/transfer-history';
import type { DeviceIdentity } from '../storage/device-identity';
import type { TcpClient } from '../transfer/tcp-client';
import type { IncomingOfferInfo, OfferResponder, TcpServer } from '../transfer/tcp-server';

interface PendingOffer {
  info: IncomingOfferInfo;
  responder: OfferResponder;
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
}

export interface IpcContext {
  registry: DeviceRegistry;
  tcpServer: TcpServer;
  tcpClient: TcpClient;
  sandbox: Sandbox;
  sandboxLocation: SandboxLocationStore;
  settingsStore: SettingsStore;
  transferHistoryStore: TransferHistoryStore;
  identity: DeviceIdentity;
  getSelfDevice: () => Device;
  getWindow: () => BrowserWindow | null;
}

export function registerIpcHandlers(context: IpcContext): void {
  const pendingOffers = new Map<string, PendingOffer>();
  const completedOrAcceptedOffers = new Map<string, AcceptedInboundMeta>();
  const outboundTransfers = new Map<string, OutboundTransferMeta>();
  const cancellingOutboundTransfers = new Set<string>();

  const sendToRenderer = <T>(channel: IpcChannel, payload: T): void => {
    const window = context.getWindow();
    if (!window || window.isDestroyed()) return;
    window.webContents.send(channel, payload);
  };

  const publishTransferEvent = (
    channel: typeof IpcChannels.TransferProgress | typeof IpcChannels.TransferComplete,
    progress: TransferProgress
  ): void => {
    context.transferHistoryStore.upsert(progress);
    sendToRenderer(channel, progress);
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

  const isTrustedDevice = (deviceId: string, settings: Settings): boolean => {
    return settings.trustedDevices.some((device) => device.deviceId === deviceId);
  };

  const resolveReceiveMode = (info: IncomingOfferInfo, settings: Settings): ReceiveMode => {
    if (isTrustedDevice(info.fromDevice.deviceId, settings)) {
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

  ipcMain.handle(IpcChannels.GetDevices, (): Device[] => {
    return context.registry.list();
  });

  ipcMain.handle(IpcChannels.GetSelfDevice, (): Device => {
    return context.getSelfDevice();
  });

  ipcMain.handle(IpcChannels.GetTransferHistory, (): TransferRecord[] => {
    return context.transferHistoryStore.list();
  });

  ipcMain.handle(
    IpcChannels.SendFile,
    (_event, deviceId: string, filePath: string, existingTransferId?: string): TransferId => {
    const device = context.registry.list().find((candidate) => candidate.deviceId === deviceId);
    if (!device) {
      throw new Error(`device ${deviceId} not found`);
    }

    const transferId = existingTransferId ?? randomUUID();
    const fileName = basename(filePath);
    const fileSize = statSync(filePath).size;
    const meta: OutboundTransferMeta = {
      transferId,
      fileName,
      fileSize,
      peerDeviceName: device.name,
      peerDeviceId: device.deviceId,
      localPath: filePath
    };

    outboundTransfers.set(transferId, meta);
    publishTransferEvent(IpcChannels.TransferProgress, makeOutboundProgress(meta, 0, 'pending'));

    void context.tcpClient
      .sendFile({
        host: device.address,
        port: device.port,
        filePath,
        fileId: transferId
      })
      .then(() => {
        const currentMeta = outboundTransfers.get(transferId) ?? meta;
        publishTransferEvent(
          IpcChannels.TransferComplete,
          makeOutboundProgress(currentMeta, currentMeta.fileSize, 'completed')
        );
        outboundTransfers.delete(transferId);
      })
      .catch((error: Error) => {
        const currentMeta = outboundTransfers.get(transferId) ?? meta;
        const wasCancelled =
          cancellingOutboundTransfers.has(transferId) || error.message.includes('transfer cancelled');

        if (wasCancelled) {
          publishTransferEvent(
            IpcChannels.TransferProgress,
            makeOutboundProgress(currentMeta, 0, 'cancelled')
          );
          cancellingOutboundTransfers.delete(transferId);
          outboundTransfers.delete(transferId);
          return;
        }

        publishTransferEvent(
          IpcChannels.TransferProgress,
          makeOutboundProgress(currentMeta, 0, 'failed', error.message)
        );
        outboundTransfers.delete(transferId);
      });

    return { value: transferId };
  });

  ipcMain.handle(IpcChannels.CancelTransfer, (_event, transferId: string): void => {
    const outbound = outboundTransfers.get(transferId);
    if (outbound) {
      const cancelled = context.tcpClient.cancel(transferId);
      if (!cancelled) {
        throw new Error(`transfer ${transferId} not found`);
      }
      cancellingOutboundTransfers.add(transferId);
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
    context.transferHistoryStore.clear();
  });

  ipcMain.handle(IpcChannels.ClearResumeCache, (): void => {
    context.sandbox.clearResumeCache();
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

    const rootPath = context.sandboxLocation.save(selected.filePaths[0]);
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

    sendToRenderer(IpcChannels.IncomingOffer, offer);
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

  context.tcpServer.on('transfer-cancelled', (info) => {
    const receiveMode = completedOrAcceptedOffers.get(info.offerId)?.receiveMode ?? 'manual';
    publishTransferEvent(
      IpcChannels.TransferProgress,
      makeInboundProgress(info, info.bytesReceived, 'cancelled', receiveMode)
    );
    completedOrAcceptedOffers.delete(info.offerId);
  });

  context.tcpServer.on('transfer-error', (error) => {
    publishTransferEvent(IpcChannels.TransferProgress, {
      transferId: randomUUID(),
      direction: 'receive',
      fileName: 'incoming file',
      fileSize: 0,
      bytesTransferred: 0,
      peerDeviceName: '',
      status: 'failed',
      error: error.message
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
      localPath: meta?.localPath ?? ''
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
