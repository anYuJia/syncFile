// Shared types between main and renderer processes.
// Keep this file runtime-agnostic (no Electron/Node imports).

export interface Device {
  deviceId: string;
  name: string;
  trustFingerprint: string;
  host: string;
  address: string; // resolved IP address
  port: number;
  platform: string;
  version: string;
}

export interface TransferId {
  value: string;
}

export type TransferDirection = 'send' | 'receive';

export type TransferStatus =
  | 'pending'
  | 'in-progress'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'cancelled';

export interface TransferProgress {
  transferId: string;
  direction: TransferDirection;
  fileName: string;
  fileSize: number;
  bytesTransferred: number;
  peerDeviceName: string;
  peerDeviceId?: string;
  status: TransferStatus;
  receiveMode?: 'manual' | 'trusted-device' | 'auto-accept';
  localPath?: string;
  sourceFileModifiedAt?: number;
  error?: string;
}

export interface TransferRecord extends TransferProgress {
  updatedAt: number;
}

export interface IncomingOffer {
  offerId: string;
  fromDevice: {
    deviceId: string;
    name: string;
    trustFingerprint: string;
  };
  fileName: string;
  fileSize: number;
  mimeType?: string;
  receivedAt: number;
  saveDirectory: string;
}

export type RejectReason = 'user-declined' | 'too-large' | 'type-not-allowed';

export interface TrustedDevice {
  deviceId: string;
  name: string;
  trustFingerprint: string;
  trustedAt: number;
}

export interface Settings {
  maxSandboxSizeMB: number;
  autoAccept: boolean;
  autoAcceptMaxSizeMB: number;
  openReceivedFolder: boolean;
  trustedDevices: TrustedDevice[];
}

export interface SandboxLocationInfo {
  path: string;
  isCustom: boolean;
  usageBytes: number;
}

export interface MaintenanceInfo {
  transferHistoryCount: number;
  resumableTransferCount: number;
  resumableTransferBytes: number;
}

export interface SettingsPayload extends Settings {
  sandboxLocation: SandboxLocationInfo;
  maintenance: MaintenanceInfo;
}
