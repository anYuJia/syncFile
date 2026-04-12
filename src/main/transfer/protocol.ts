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
  signature?: string;
  fromDevice: {
    deviceId: string;
    name: string;
    trustFingerprint: string;
    trustPublicKey: string;
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
  reason: 'user-declined' | 'too-large' | 'type-not-allowed' | 'identity-mismatch';
}

export interface FileCompleteMessage {
  type: 'file-complete';
  fileId: string;
  bytesSent: number;
}

export interface FileCancelMessage {
  type: 'file-cancel';
  fileId: string;
  reason: 'sender-cancelled' | 'sender-paused' | 'receiver-cancelled';
}

export interface PairRequestMessage {
  type: 'pair-request';
  version: typeof PROTOCOL_VERSION;
  requestId: string;
  timestamp: number;
  fromDevice: {
    deviceId: string;
    name: string;
    trustFingerprint: string;
    trustPublicKey: string;
  };
  signature?: string;
}

export interface PairResponseMessage {
  type: 'pair-response';
  requestId: string;
  accepted: boolean;
}

export type ProtocolMessage =
  | FileOfferMessage
  | FileAcceptMessage
  | FileRejectMessage
  | FileCompleteMessage
  | FileCancelMessage
  | PairRequestMessage
  | PairResponseMessage;

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

export function isPairRequest(msg: ProtocolMessage): msg is PairRequestMessage {
  return msg.type === 'pair-request';
}

export function isPairResponse(msg: ProtocolMessage): msg is PairResponseMessage {
  return msg.type === 'pair-response';
}
