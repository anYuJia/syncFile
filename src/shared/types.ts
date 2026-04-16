// Shared types between main and renderer processes.
// Keep this file runtime-agnostic (no Electron/Node imports).

export interface Device {
  deviceId: string;
  name: string;
  avatarDataUrl?: string;
  hasAvatar?: boolean;
  profileRevision?: number;
  trustFingerprint: string;
  trustPublicKey: string;
  host: string;
  address: string; // resolved IP address
  port: number;
  platform: string;
  version: string;
}

export interface TransferId {
  value: string;
}

export type PeerReachabilityStatus = 'unknown' | 'checking' | 'reachable' | 'unreachable';

export interface DeviceReachability {
  deviceId: string;
  status: PeerReachabilityStatus;
  checkedAt: number;
  error?: string;
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
  batchId?: string;
  batchLabel?: string;
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
  sourceFileSha256?: string;
  error?: string;
}

export interface TransferRecord extends TransferProgress {
  updatedAt: number;
}

export type RuntimeLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface RuntimeLogEntry {
  sequence: number;
  timestamp: number;
  level: RuntimeLogLevel;
  scope: string;
  message: string;
  details?: string;
}

export interface IncomingOffer {
  offerId: string;
  fromDevice: {
    deviceId: string;
    name: string;
    trustFingerprint: string;
    trustPublicKey: string;
  };
  fileName: string;
  fileSize: number;
  mimeType?: string;
  receivedAt: number;
  saveDirectory: string;
  stale?: boolean;
}

export interface PairRequest {
  requestId: string;
  fromDevice: {
    deviceId: string;
    name: string;
    trustFingerprint: string;
    trustPublicKey: string;
  };
  receivedAt: number;
}

export type RejectReason = 'user-declined' | 'too-large' | 'type-not-allowed' | 'identity-mismatch';

export interface TrustedDevice {
  deviceId: string;
  name: string;
  trustFingerprint: string;
  trustPublicKey: string;
  trustedAt: number;
}

export interface ProfilePayload {
  name: string;
  avatarDataUrl?: string;
}

export interface PeerProfilePayload {
  deviceId: string;
  name: string;
  avatarDataUrl?: string;
  hasAvatar: boolean;
  profileRevision: number;
}

export interface Settings {
  maxSandboxSizeMB: number;
  autoAccept: boolean;
  autoAcceptMaxSizeMB: number;
  openReceivedFolder: boolean;
  desktopNotifications: boolean;
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
