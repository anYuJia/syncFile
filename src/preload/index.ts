import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import { IpcChannels } from '../shared/ipc-channels';
import type {
  Device,
  IncomingOffer,
  RejectReason,
  TransferId,
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
  sendFile: (deviceId: string, filePath: string): Promise<TransferId> =>
    ipcRenderer.invoke(IpcChannels.SendFile, deviceId, filePath),
  acceptIncoming: (offerId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.AcceptIncoming, offerId),
  rejectIncoming: (offerId: string, reason?: RejectReason): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.RejectIncoming, offerId, reason),
  openSandbox: (): Promise<void> => ipcRenderer.invoke(IpcChannels.OpenSandbox),
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
