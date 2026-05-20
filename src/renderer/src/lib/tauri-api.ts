/**
 * Renderer API bridge backed by Tauri commands and events.
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

const isTauriRuntime = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  const internals = (window as Window & { __TAURI_INTERNALS__?: { invoke?: unknown } }).__TAURI_INTERNALS__;
  return typeof internals?.invoke === 'function';
};

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
    try {
      const result = await invoke<string | null>('select_file');
      return result;
    } catch {
      // 降级到 HTML file input
      return null;
    }
  },

  selectFiles: async (): Promise<string[]> => {
    try {
      return await invoke<string[]>('select_files');
    } catch {
      return [];
    }
  },

  selectFolderFiles: async (): Promise<string[]> => {
    try {
      return await invoke<string[]>('select_folder_files');
    } catch {
      return [];
    }
  },

  clearResumeCache: (): Promise<void> => invoke('clear_resume_cache'),

  getPathForFile: (file: File): string => {
    // Tauri 中拖放的文件带有 path 属性
    if ('path' in file && typeof (file as File & { path: string }).path === 'string') {
      return (file as File & { path: string }).path;
    }
    return '';
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

// 导出给 renderer 使用的全局 API 类型。
export type SyncFileAPI = typeof tauriSyncFileApi;

const previewDevice: Device = {
  deviceId: 'preview-local',
  name: 'This Mac',
  trustFingerprint: 'preview-fingerprint',
  trustPublicKey: '',
  host: 'localhost',
  address: '127.0.0.1',
  port: 43434,
  platform: 'darwin',
  version: '0.0.29'
};

const previewSettings: SettingsPayload = {
  maxSandboxSizeMB: 1024,
  autoAccept: false,
  autoAcceptMaxSizeMB: 128,
  openReceivedFolder: false,
  desktopNotifications: true,
  trustedDevices: [],
  sandboxLocation: {
    path: '~/Library/Application Support/syncFile/sandbox',
    isCustom: false,
    usageBytes: 0
  },
  maintenance: {
    transferHistoryCount: 0,
    resumableTransferCount: 0,
    resumableTransferBytes: 0
  }
};

const previewSyncFileApi: SyncFileAPI = {
  getDevices: async () => [],
  refreshDevices: async () => [],
  getSelfDevice: async () => previewDevice,
  probeDevice: async (deviceId) => ({ deviceId, status: 'unknown', checkedAt: Date.now() }),
  fetchPeerProfile: async () => null,
  pairDevice: async () => undefined,
  acceptPairRequest: async () => undefined,
  rejectPairRequest: async () => undefined,
  getTransferHistory: async () => [],
  getPendingOffers: async () => [],
  sendFile: async () => ({ value: crypto.randomUUID?.() ?? `preview-${Date.now()}` }),
  pauseTransfer: async () => undefined,
  cancelTransfer: async () => undefined,
  acceptIncoming: async () => undefined,
  rejectIncoming: async () => undefined,
  clearTransferHistory: async () => undefined,
  removeTransferHistoryItems: async () => undefined,
  openSandbox: async () => undefined,
  openTransferPath: async () => undefined,
  revealTransferPath: async () => undefined,
  getSandboxLocation: async () => previewSettings.sandboxLocation,
  chooseSandboxLocation: async () => null,
  selectFile: async () => null,
  selectFiles: async () => [],
  selectFolderFiles: async () => [],
  clearResumeCache: async () => undefined,
  getPathForFile: () => '',
  getSettings: async () => previewSettings,
  saveSettings: async (settings) => ({ ...previewSettings, ...settings }),
  saveProfile: async (profile) => ({ ...previewDevice, ...profile }),
  getRuntimeLogs: async () => [],
  clearRuntimeLogs: async () => undefined,
  onDeviceOnline: () => () => undefined,
  onDeviceOffline: () => () => undefined,
  onTransferProgress: () => () => undefined,
  onTransferComplete: () => () => undefined,
  onTransferHistoryReset: () => () => undefined,
  onIncomingOffer: () => () => undefined,
  onIncomingPairRequest: () => () => undefined,
  onPairRequestRemoved: () => () => undefined,
  onRuntimeLog: () => () => undefined,
  onSelfDeviceUpdated: () => () => undefined
};

// 全局暴露给现有 renderer 代码。
if (typeof window !== 'undefined') {
  if (isTauriRuntime()) {
    window.syncFile = tauriSyncFileApi;
  } else if (!window.syncFile) {
    window.syncFile = previewSyncFileApi;
  }
}

// 确保 TypeScript 能正确识别全局类型
declare global {
  interface Window {
    syncFile: SyncFileAPI;
  }
}
