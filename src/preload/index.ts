import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import { IpcChannels } from '../shared/ipc-channels';
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
} from '../shared/types';

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.off(channel, listener);
  };
}

const api = {
  getDevices: (): Promise<Device[]> => ipcRenderer.invoke(IpcChannels.GetDevices),
  getSelfDevice: (): Promise<Device> => ipcRenderer.invoke(IpcChannels.GetSelfDevice),
  getTransferHistory: (): Promise<TransferRecord[]> => ipcRenderer.invoke(IpcChannels.GetTransferHistory),
  sendFile: (deviceId: string, filePath: string, existingTransferId?: string): Promise<TransferId> =>
    ipcRenderer.invoke(IpcChannels.SendFile, deviceId, filePath, existingTransferId),
  pauseTransfer: (transferId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.PauseTransfer, transferId),
  cancelTransfer: (transferId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.CancelTransfer, transferId),
  acceptIncoming: (offerId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.AcceptIncoming, offerId),
  rejectIncoming: (offerId: string, reason?: RejectReason): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.RejectIncoming, offerId, reason),
  openSandbox: (): Promise<void> => ipcRenderer.invoke(IpcChannels.OpenSandbox),
  openTransferPath: (path: string): Promise<void> => ipcRenderer.invoke(IpcChannels.OpenTransferPath, path),
  revealTransferPath: (path: string): Promise<void> => ipcRenderer.invoke(IpcChannels.RevealTransferPath, path),
  clearTransferHistory: (): Promise<void> => ipcRenderer.invoke(IpcChannels.ClearTransferHistory),
  clearResumeCache: (): Promise<void> => ipcRenderer.invoke(IpcChannels.ClearResumeCache),
  getSandboxLocation: (): Promise<SandboxLocationInfo> => ipcRenderer.invoke(IpcChannels.GetSandboxLocation),
  chooseSandboxLocation: (): Promise<SandboxLocationInfo | null> =>
    ipcRenderer.invoke(IpcChannels.ChooseSandboxLocation),
  selectFile: (): Promise<string | null> => ipcRenderer.invoke(IpcChannels.SelectFile),
  getSettings: (): Promise<SettingsPayload> => ipcRenderer.invoke(IpcChannels.GetSettings),
  saveSettings: (settings: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke(IpcChannels.SaveSettings, settings),
  onDeviceOnline: (callback: (device: Device) => void): (() => void) =>
    subscribe(IpcChannels.DeviceOnline, callback),
  onDeviceOffline: (callback: (deviceId: string) => void): (() => void) =>
    subscribe(IpcChannels.DeviceOffline, callback),
  onTransferProgress: (callback: (progress: TransferProgress) => void): (() => void) =>
    subscribe(IpcChannels.TransferProgress, callback),
  onTransferComplete: (callback: (progress: TransferProgress) => void): (() => void) =>
    subscribe(IpcChannels.TransferComplete, callback),
  onIncomingOffer: (callback: (offer: IncomingOffer) => void): (() => void) =>
    subscribe(IpcChannels.IncomingOffer, callback)
};

export type SyncFileAPI = typeof api;

contextBridge.exposeInMainWorld('syncFile', api);
