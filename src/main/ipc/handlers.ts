import { randomUUID } from 'crypto';
import { basename } from 'path';
import { statSync } from 'fs';

import { BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron';

import { IpcChannels, type IpcChannel } from '../../shared/ipc-channels';
import type {
  Device,
  IncomingOffer,
  RejectReason,
  Settings,
  TransferId,
  TransferProgress
} from '../../shared/types';
import type { DeviceRegistry } from '../discovery/device-registry';
import type { SandboxLocationStore } from '../storage/sandbox-location';
import type { Sandbox } from '../storage/sandbox';
import type { SettingsStore } from '../storage/settings';
import type { DeviceIdentity } from '../storage/device-identity';
import type { TcpClient } from '../transfer/tcp-client';
import type { IncomingOfferInfo, OfferResponder, TcpServer } from '../transfer/tcp-server';

interface PendingOffer {
  info: IncomingOfferInfo;
  responder: OfferResponder;
}

interface OutboundTransferMeta {
  transferId: string;
  fileName: string;
  fileSize: number;
  peerDeviceName: string;
}

export interface IpcContext {
  registry: DeviceRegistry;
  tcpServer: TcpServer;
  tcpClient: TcpClient;
  sandbox: Sandbox;
  sandboxLocation: SandboxLocationStore;
  settingsStore: SettingsStore;
  identity: DeviceIdentity;
  getSelfDevice: () => Device;
  getWindow: () => BrowserWindow | null;
}

export function registerIpcHandlers(context: IpcContext): void {
  const pendingOffers = new Map<string, PendingOffer>();
  const completedOrAcceptedOffers = new Map<string, IncomingOfferInfo>();
  const outboundTransfers = new Map<string, OutboundTransferMeta>();

  const sendToRenderer = <T>(channel: IpcChannel, payload: T): void => {
    const window = context.getWindow();
    if (!window || window.isDestroyed()) return;
    window.webContents.send(channel, payload);
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
    status,
    error
  });

  ipcMain.handle(IpcChannels.GetDevices, (): Device[] => {
    return context.registry.list();
  });

  ipcMain.handle(IpcChannels.GetSelfDevice, (): Device => {
    return context.getSelfDevice();
  });

  ipcMain.handle(IpcChannels.SendFile, (_event, deviceId: string, filePath: string): TransferId => {
    const device = context.registry.list().find((candidate) => candidate.deviceId === deviceId);
    if (!device) {
      throw new Error(`device ${deviceId} not found`);
    }

    const transferId = randomUUID();
    const fileName = basename(filePath);
    const fileSize = statSync(filePath).size;
    const meta: OutboundTransferMeta = {
      transferId,
      fileName,
      fileSize,
      peerDeviceName: device.name
    };

    outboundTransfers.set(transferId, meta);
    sendToRenderer(IpcChannels.TransferProgress, makeOutboundProgress(meta, 0, 'pending'));

    void context.tcpClient
      .sendFile({
        host: device.address,
        port: device.port,
        filePath,
        fileId: transferId
      })
      .then(() => {
        const currentMeta = outboundTransfers.get(transferId) ?? meta;
        sendToRenderer(
          IpcChannels.TransferComplete,
          makeOutboundProgress(currentMeta, currentMeta.fileSize, 'completed')
        );
        outboundTransfers.delete(transferId);
      })
      .catch((error: Error) => {
        const currentMeta = outboundTransfers.get(transferId) ?? meta;
        sendToRenderer(
          IpcChannels.TransferProgress,
          makeOutboundProgress(currentMeta, 0, 'failed', error.message)
        );
        outboundTransfers.delete(transferId);
      });

    return { value: transferId };
  });

  ipcMain.handle(IpcChannels.AcceptIncoming, (_event, offerId: string): void => {
    const pending = pendingOffers.get(offerId);
    if (!pending) {
      throw new Error(`offer ${offerId} not found`);
    }
    completedOrAcceptedOffers.set(offerId, pending.info);
    pending.responder.accept();
    pendingOffers.delete(offerId);
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
    }
  );

  ipcMain.handle(IpcChannels.OpenSandbox, async (): Promise<void> => {
    let targetPath = context.sandboxLocation.currentPath();
    if (!targetPath) {
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
        return;
      }

      targetPath = context.sandboxLocation.save(selected.filePaths[0]);
      context.sandbox.setRoot(targetPath);
    }

    const result = await shell.openPath(context.sandbox.rootPath());
    if (result.length > 0) {
      throw new Error(result);
    }
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

  ipcMain.handle(IpcChannels.GetSettings, (): Settings => {
    return context.settingsStore.get();
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
    pendingOffers.set(info.offerId, { info, responder });

    const offer: IncomingOffer = {
      offerId: info.offerId,
      fromDevice: info.fromDevice,
      fileName: info.fileName,
      fileSize: info.fileSize,
      mimeType: info.mimeType,
      receivedAt: Date.now()
    };

    sendToRenderer(IpcChannels.IncomingOffer, offer);
  });

  context.tcpServer.on('transfer-complete', (info) => {
    const meta = completedOrAcceptedOffers.get(info.offerId);
    const progress: TransferProgress = {
      transferId: info.offerId,
      direction: 'receive',
      fileName: meta?.fileName ?? basename(info.savedPath),
      fileSize: meta?.fileSize ?? info.bytesReceived,
      bytesTransferred: info.bytesReceived,
      peerDeviceName: info.fromDevice.name,
      status: 'completed'
    };

    completedOrAcceptedOffers.delete(info.offerId);
    sendToRenderer(IpcChannels.TransferComplete, progress);
  });

  context.tcpServer.on('transfer-error', (error) => {
    sendToRenderer(IpcChannels.TransferProgress, {
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
      peerDeviceName: meta?.peerDeviceName ?? ''
    };
    const currentMeta = meta ?? fallbackMeta;
    sendToRenderer(
      IpcChannels.TransferProgress,
      makeOutboundProgress(
        currentMeta,
        progress.bytesTransferred,
        progress.bytesTransferred >= progress.totalBytes ? 'completed' : 'in-progress'
      )
    );
  });
}
