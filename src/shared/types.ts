// Shared types between main and renderer processes.
// Keep this file runtime-agnostic (no Electron/Node imports).

export interface Device {
  deviceId: string;
  name: string;
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
  | 'completed'
  | 'failed'
  | 'rejected';

export interface TransferProgress {
  transferId: string;
  direction: TransferDirection;
  fileName: string;
  fileSize: number;
  bytesTransferred: number;
  peerDeviceName: string;
  status: TransferStatus;
  error?: string;
}

export interface IncomingOffer {
  offerId: string;
  fromDevice: {
    deviceId: string;
    name: string;
  };
  fileName: string;
  fileSize: number;
  mimeType?: string;
  receivedAt: number;
}

export type RejectReason = 'user-declined' | 'too-large' | 'type-not-allowed';

export interface Settings {
  maxSandboxSizeMB: number;
  autoAccept: boolean;
  openReceivedFolder: boolean;
}

export interface SandboxLocationInfo {
  path: string;
  isCustom: boolean;
  usageBytes: number;
}

export interface SettingsPayload extends Settings {
  sandboxLocation: SandboxLocationInfo;
}
