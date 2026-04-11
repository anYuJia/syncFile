// Wire-level protocol messages exchanged over TCP between devices.
// Version: 1

export const PROTOCOL_VERSION = 1 as const;

export interface FileOfferMessage {
  type: 'file-offer';
  version: typeof PROTOCOL_VERSION;
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType?: string;
  sha256?: string;
  fromDevice: {
    deviceId: string;
    name: string;
    trustFingerprint: string;
  };
}

export interface FileAcceptMessage {
  type: 'file-accept';
  fileId: string;
  startOffset?: number;
}

export interface FileRejectMessage {
  type: 'file-reject';
  fileId: string;
  reason: 'user-declined' | 'too-large' | 'type-not-allowed';
}

export interface FileCompleteMessage {
  type: 'file-complete';
  fileId: string;
  bytesSent: number;
}

export interface FileCancelMessage {
  type: 'file-cancel';
  fileId: string;
  reason: 'sender-cancelled' | 'receiver-cancelled';
}

export type ProtocolMessage =
  | FileOfferMessage
  | FileAcceptMessage
  | FileRejectMessage
  | FileCompleteMessage
  | FileCancelMessage;

export function isFileOffer(msg: ProtocolMessage): msg is FileOfferMessage {
  return msg.type === 'file-offer';
}

export function isFileAccept(msg: ProtocolMessage): msg is FileAcceptMessage {
  return msg.type === 'file-accept';
}

export function isFileReject(msg: ProtocolMessage): msg is FileRejectMessage {
  return msg.type === 'file-reject';
}

export function isFileComplete(msg: ProtocolMessage): msg is FileCompleteMessage {
  return msg.type === 'file-complete';
}

export function isFileCancel(msg: ProtocolMessage): msg is FileCancelMessage {
  return msg.type === 'file-cancel';
}
