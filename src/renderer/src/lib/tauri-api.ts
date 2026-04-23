/**
 * Tauri IPC 包装层 - 与 Electron API 100% 兼容
 * 这个文件暴露了和 Electron preload 完全相同的 API 接口，
 * 但底层使用 Tauri 的 invoke 和 event 系统
 */
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// 复用现有的类型定义
import type {
  Device,
  DeviceReachability,
  IncomingOffer,
  PairRequest,
  RejectReason,
  RuntimeLogEntry,
  Settings,
  TransferId,
  TransferRecord,
  TransferProgress,
  PeerProfilePayload,
  ProfilePayload,
  SettingsPayload,
  SandboxLocationInfo
} from '@shared/types';

// ============== 事件订阅 ==============
function subscribe<T>(eventName: string, callback: (payload: T) => void): () => void {
  const unlistenPromise = listen<T>(eventName, (event) => {
    callback(event.payload);
  });

  return () => {
    unlistenPromise.then((unlisten: UnlistenFn) => unlisten());
  };
}

// ============== 命令调用 ==============
export const tauriSyncFileApi = {
  // --- Devices ---
  getDevices: (): Promise<Device[]> => invoke('get_devices'),

  refreshDevices: (): Promise<Device[]> => invoke('refresh_devices'),

  getSelfDevice: (): Promise<Device> => invoke('get_self_device'),

  probeDevice: (deviceId: string): Promise<DeviceReachability> => invoke('probe_device', { deviceId }),

  fetchPeerProfile: (deviceId: string): Promise<PeerProfilePayload | null> =>
    invoke('fetch_peer_profile', { deviceId }),

  // --- Pairing ---
  pairDevice: (deviceId: string): Promise<void> => invoke('pair_device', { deviceId }),

  acceptPairRequest: (requestId: string): Promise<void> => invoke('accept_pair_request', { requestId }),

  rejectPairRequest: (requestId: string): Promise<void> => invoke('reject_pair_request', { requestId }),

  // --- Transfers ---
  getTransferHistory: (): Promise<TransferRecord[]> => invoke('get_transfer_history'),

  getPendingOffers: (): Promise<IncomingOffer[]> => invoke('get_pending_offers'),

  sendFile: (
    deviceId: string,
    filePath: string,
    existingTransferId?: string,
    batchMeta?: { batchId?: string; batchLabel?: string }
  ): Promise<TransferId> =>
    invoke('send_file', { deviceId, filePath, existingTransferId, batchMeta }),

  pauseTransfer: (transferId: string): Promise<void> =>
    invoke('pause_transfer', { transferId }),

  cancelTransfer: (transferId: string): Promise<void> =>
    invoke('cancel_transfer', { transferId }),

  acceptIncoming: (offerId: string): Promise<void> =>
    invoke('accept_incoming', { offerId }),

  rejectIncoming: (offerId: string, reason?: RejectReason): Promise<void> =>
    invoke('reject_incoming', { offerId, reason }),

  clearTransferHistory: (): Promise<void> => invoke('clear_transfer_history'),

  removeTransferHistoryItems: (transferIds: string[]): Promise<void> =>
    invoke('remove_transfer_history_items', { transferIds }),

  // --- Filesystem ---
  openSandbox: (): Promise<void> => invoke('open_sandbox'),

  openTransferPath: (path: string): Promise<void> => invoke('open_transfer_path', { path }),

  revealTransferPath: (path: string): Promise<void> => invoke('reveal_transfer_path', { path }),

  getSandboxLocation: (): Promise<SandboxLocationInfo> => invoke('get_sandbox_location'),

  chooseSandboxLocation: (): Promise<SandboxLocationInfo | null> => invoke('choose_sandbox_location'),

  selectFile: async (): Promise<string | null> => {
    // 使用 Tauri dialog 插件选择文件
    try {
      const result = await invoke<string | null>('select_file');
      return result;
    } catch {
      // 降级到 HTML file input
      return null;
    }
  },

  clearResumeCache: (): Promise<void> => invoke('clear_resume_cache'),

  getPathForFile: (file: File): string => {
    // Tauri 中拖放的文件带有 path 属性
    if ('path' in file && typeof (file as File & { path: string }).path === 'string') {
      return (file as File & { path: string }).path;
    }
    return file.webkitRelativePath || file.name;
  },

  // --- Settings ---
  getSettings: (): Promise<SettingsPayload> => invoke('get_settings'),

  saveSettings: (settings: Partial<Settings>): Promise<Settings> =>
    invoke('save_settings', { settings }),

  saveProfile: (profile: ProfilePayload): Promise<Device> =>
    invoke('save_profile', { profile }),

  // --- Logs ---
  getRuntimeLogs: (): Promise<RuntimeLogEntry[]> => invoke('get_runtime_logs'),

  clearRuntimeLogs: (): Promise<void> => invoke('clear_runtime_logs'),

  // --- Event Subscriptions ---
  onDeviceOnline: (callback: (device: Device) => void): (() => void) =>
    subscribe('device-online', callback),

  onDeviceOffline: (callback: (deviceId: string) => void): (() => void) =>
    subscribe('device-offline', callback),

  onTransferProgress: (callback: (progress: TransferProgress) => void): (() => void) =>
    subscribe('transfer-progress', callback),

  onTransferComplete: (callback: (progress: TransferProgress) => void): (() => void) =>
    subscribe('transfer-complete', callback),

  onTransferHistoryReset: (callback: (items: TransferRecord[]) => void): (() => void) =>
    subscribe('transfer-history-reset', callback),

  onIncomingOffer: (callback: (offer: IncomingOffer) => void): (() => void) =>
    subscribe('incoming-offer', callback),

  onIncomingPairRequest: (callback: (request: PairRequest) => void): (() => void) =>
    subscribe('incoming-pair-request', callback),

  onPairRequestRemoved: (callback: (requestId: string) => void): (() => void) =>
    subscribe('pair-request-removed', callback),

  onRuntimeLog: (callback: (entry: RuntimeLogEntry) => void): (() => void) =>
    subscribe('runtime-log', callback),

  onSelfDeviceUpdated: (callback: (device: Device) => void): (() => void) =>
    subscribe('self-device-updated', callback),
};

// 导出类型，保持与 Electron 兼容
export type SyncFileAPI = typeof tauriSyncFileApi;

// 全局暴露，替代 window.syncFile
if (typeof window !== 'undefined') {
  (window as any).syncFile = tauriSyncFileApi;
}

// 确保 TypeScript 能正确识别全局类型
declare global {
  interface Window {
    syncFile: SyncFileAPI;
  }
}
