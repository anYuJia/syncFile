import { createReadStream, statSync } from 'fs';
import { basename } from 'path';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { connect, type Socket } from 'net';
import type { ReadStream } from 'fs';

import { MessageDecoder, encodeMessage } from './codec';
import { signFileOffer, signPairRequest } from '../security/trust';
import { logError, logInfo, logWarn } from '../logging/runtime-log';
import { secureConnect, type ExpectedPeerIdentity, type SecureIdentity, type SecureSocket } from './secure-channel';
import {
  isFileAccept,
  isFileCancel,
  isProfileResponse,
  isPairResponse,
  isFileReject,
  type FileOfferMessage,
  type ProfileResponseMessage,
  type PairRequestMessage
} from './protocol';

const DEFAULT_CONNECT_TIMEOUT_MS = 8000;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 15000;
const DEFAULT_RESPONSE_TIMEOUT_MS = 180000;
const DEFAULT_IDLE_TIMEOUT_MS = 120000;

export interface TcpClientOptions {
  selfDevice: {
    deviceId: string;
    name: string;
    trustFingerprint: string;
    trustPublicKey: string;
    trustPrivateKey: string;
  };
  connectTimeoutMs?: number;
  handshakeTimeoutMs?: number;
  responseTimeoutMs?: number;
  idleTimeoutMs?: number;
}

export interface SendFileParams {
  host: string;
  port: number;
  peer: ExpectedPeerIdentity;
  filePath: string;
  fileId?: string;
  sha256: string;
}

export interface SendFileResult {
  fileId: string;
  fileName: string;
  totalBytes: number;
}

export interface ProgressEvent {
  fileId: string;
  fileName: string;
  bytesTransferred: number;
  totalBytes: number;
}

interface ActiveTransfer {
  socket: SecureSocket | null;
  stream: ReadStream | null;
  intent: 'pause' | 'cancel' | null;
  accepted: boolean;
}

export declare interface TcpClient {
  on(event: 'progress', listener: (progress: ProgressEvent) => void): this;
  once(event: 'progress', listener: (progress: ProgressEvent) => void): this;
  off(event: 'progress', listener: (progress: ProgressEvent) => void): this;
  emit(event: 'progress', progress: ProgressEvent): boolean;
}

export class TcpClient extends EventEmitter {
  private readonly activeTransfers = new Map<string, ActiveTransfer>();

  constructor(private readonly options: TcpClientOptions) {
    super();
  }

  cancel(fileId: string): boolean {
    return this.interrupt(fileId, 'cancel');
  }

  pause(fileId: string): boolean {
    return this.interrupt(fileId, 'pause');
  }

  private interrupt(fileId: string, intent: ActiveTransfer['intent']): boolean {
    const transfer = this.activeTransfers.get(fileId);
    if (!transfer) {
      return false;
    }

    transfer.intent = intent;
    if (!transfer.socket) {
      return true;
    }

    if (!transfer.accepted) {
      try {
        transfer.socket.write(
          encodeMessage({
            type: 'file-cancel',
            fileId,
            reason: intent === 'pause' ? 'sender-paused' : 'sender-cancelled'
          }),
          () => transfer.socket?.end()
        );
      } catch {
        // Best effort only.
      }
    } else {
      transfer.socket.destroy();
    }
    transfer.stream?.destroy(new Error(intent === 'pause' ? 'transfer paused' : 'transfer cancelled'));
    setTimeout(() => {
      if (transfer.socket && !transfer.socket.destroyed) {
        transfer.socket.destroy();
      }
    }, 200);
    return true;
  }

  async sendFile(params: SendFileParams): Promise<SendFileResult> {
    const stats = statSync(params.filePath);
    const fileId = params.fileId ?? randomUUID();
    const fileName = basename(params.filePath);
    const decoder = new MessageDecoder();
    const activeTransfer: ActiveTransfer = {
      socket: null,
      stream: null,
      intent: null,
      accepted: false
    };
    this.activeTransfers.set(fileId, activeTransfer);

    const unsignedOffer: Omit<FileOfferMessage, 'signature'> = {
      type: 'file-offer',
      version: 1,
      fileId,
      fileName,
      fileSize: stats.size,
      sha256: params.sha256,
      fromDevice: this.options.selfDevice
    };
    const offer: FileOfferMessage = {
      ...unsignedOffer,
      signature: signFileOffer(unsignedOffer, this.options.selfDevice.trustPrivateKey)
    };

    try {
      const rawSocket = await openSocket(
        params.host,
        params.port,
        this.options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS
      );
      logInfo('transfer', 'connected to peer tcp socket', {
        fileId,
        fileName,
        host: params.host,
        port: params.port
      });
      const socket = await secureConnect(rawSocket, {
        selfDevice: this.options.selfDevice as SecureIdentity,
        expectedPeer: params.peer,
        timeoutMs: this.options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS
      });
      activeTransfer.socket = socket;

      if (activeTransfer.intent) {
        socket.destroy();
        throw new Error(intentErrorMessage(activeTransfer.intent));
      }

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const responseTimeoutMs = this.options.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS;
        let responseTimer: NodeJS.Timeout | null = setTimeout(() => {
          responseTimer = null;
          logWarn('transfer', 'peer did not respond to file offer before response timeout', {
            fileId,
            fileName,
            timeoutMs: responseTimeoutMs
          });
          fail(new Error('peer did not respond in time'));
        }, responseTimeoutMs);

        const cleanup = (): void => {
          if (responseTimer) {
            clearTimeout(responseTimer);
            responseTimer = null;
          }
          socket.off('data', onData);
          socket.off('error', onError);
          socket.off('close', onClose);
          socket.off('timeout', onTimeout);
          socket.setTimeout(0);
        };

        const fail = (error: Error): void => {
          if (settled) return;
          settled = true;
          cleanup();
          socket.destroy();
          reject(errorForTransferIntent(activeTransfer.intent, error));
        };

        const finish = (): void => {
          if (settled) return;
          settled = true;
          cleanup();
          socket.end(() => resolve());
        };

        const onData = (chunk: Buffer): void => {
          try {
            const messages = decoder.push(chunk);
            for (const message of messages) {
              if (isFileAccept(message) && message.fileId === fileId) {
                activeTransfer.accepted = true;
                socket.setTimeout(this.options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS);
                logInfo('transfer', 'peer accepted file offer', {
                  fileId,
                  fileName,
                  startOffset: message.startOffset ?? 0
                });
                if (responseTimer) {
                  clearTimeout(responseTimer);
                  responseTimer = null;
                }
                if (activeTransfer.intent) {
                  socket.destroy();
                  fail(new Error(intentErrorMessage(activeTransfer.intent)));
                  return;
                }
                this.streamFile(
                  socket,
                  params.filePath,
                  fileId,
                  fileName,
                  stats.size,
                  message.startOffset ?? 0
                )
                  .then(finish)
                  .catch((error) => fail(error as Error));
                return;
              }

              if (isFileCancel(message) && message.fileId === fileId) {
                logWarn('transfer', 'peer cancelled file transfer before completion', {
                  fileId,
                  reason: message.reason
                });
                fail(new Error(`peer cancelled transfer: ${message.reason}`));
                return;
              }

              if (isFileReject(message) && message.fileId === fileId) {
                logWarn('transfer', 'peer rejected file offer', {
                  fileId,
                  reason: message.reason
                });
                fail(new Error(`peer declined transfer: ${message.reason}`));
                return;
              }

              fail(new Error(`unexpected message from peer: ${message.type}`));
              return;
            }
          } catch (error) {
            fail(error as Error);
          }
        };

        const onError = (error: Error): void => {
          logError('transfer', 'socket error during outbound transfer', error);
          fail(error);
        };

        const onClose = (): void => {
          if (!settled) {
            fail(
              new Error(
                activeTransfer.accepted
                  ? 'peer closed connection before transfer completed'
                  : 'peer closed connection before accepting the offer'
              )
            );
          }
        };

        const onTimeout = (): void => {
          fail(new Error('transfer timed out'));
        };

        socket.on('data', onData);
        socket.once('error', onError);
        socket.once('close', onClose);
        socket.once('timeout', onTimeout);
        socket.setTimeout(responseTimeoutMs);
        logInfo('transfer', 'sent file offer and waiting for peer response', {
          fileId,
          fileName,
          responseTimeoutMs
        });
        socket.write(encodeMessage(offer));
      });
    } finally {
      this.activeTransfers.delete(fileId);
    }

    return {
      fileId,
      fileName,
      totalBytes: stats.size
    };
  }

  async pairWithPeer(host: string, port: number, peer: ExpectedPeerIdentity): Promise<boolean> {
    const rawSocket = await openSocket(
      host,
      port,
      this.options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS
    );
    const socket = await secureConnect(rawSocket, {
      selfDevice: this.options.selfDevice as SecureIdentity,
      expectedPeer: peer,
      timeoutMs: this.options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS
    });
    const decoder = new MessageDecoder();
    const unsignedRequest: Omit<PairRequestMessage, 'signature'> = {
      type: 'pair-request',
      version: 1,
      requestId: randomUUID(),
      timestamp: Date.now(),
      fromDevice: this.options.selfDevice
    };
    const request: PairRequestMessage = {
      ...unsignedRequest,
      signature: signPairRequest(unsignedRequest, this.options.selfDevice.trustPrivateKey)
    };

    return await new Promise<boolean>((resolve, reject) => {
      let settled = false;
      const responseTimeoutMs = this.options.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS;
      let responseTimer: NodeJS.Timeout | null = setTimeout(() => {
        responseTimer = null;
        logWarn('pairing', 'peer did not respond to pair request before response timeout', {
          requestId: request.requestId,
          timeoutMs: responseTimeoutMs
        });
        fail(new Error('pairing timed out'));
      }, responseTimeoutMs);

      const cleanup = (): void => {
        if (responseTimer) {
          clearTimeout(responseTimer);
          responseTimer = null;
        }
        socket.off('data', onData);
        socket.off('error', onError);
        socket.off('close', onClose);
        socket.off('timeout', onTimeout);
        socket.setTimeout(0);
      };

      const fail = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        socket.destroy();
        reject(error);
      };

      const onData = (chunk: Buffer): void => {
        try {
          const messages = decoder.push(chunk);
          for (const message of messages) {
            if (isPairResponse(message) && message.requestId === request.requestId) {
              if (settled) {
                return;
              }
              logInfo('pairing', 'peer responded to pair request', {
                requestId: request.requestId,
                accepted: message.accepted
              });
              settled = true;
              cleanup();
              socket.end(() => resolve(message.accepted));
              return;
            }
          }
        } catch (error) {
          fail(error as Error);
        }
      };

      const onError = (error: Error): void => {
        logError('pairing', 'socket error during pair request', error);
        fail(error);
      };

      const onClose = (): void => {
        if (!settled) {
          fail(new Error('peer closed connection before pairing completed'));
        }
      };

      const onTimeout = (): void => {
        fail(new Error('pairing timed out'));
      };

      socket.setTimeout(responseTimeoutMs);
      socket.on('data', onData);
      socket.once('error', onError);
      socket.once('close', onClose);
      socket.once('timeout', onTimeout);
      logInfo('pairing', 'sent pair request and waiting for peer response', {
        requestId: request.requestId,
        responseTimeoutMs
      });
      socket.write(encodeMessage(request));
    });
  }

  async probePeer(host: string, port: number, peer: ExpectedPeerIdentity): Promise<void> {
    const rawSocket = await openSocket(
      host,
      port,
      this.options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS
    );
    const socket = await secureConnect(rawSocket, {
      selfDevice: this.options.selfDevice as SecureIdentity,
      expectedPeer: peer,
      timeoutMs: this.options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject);
      socket.end(() => resolve());
    });
  }

  async fetchPeerProfile(
    host: string,
    port: number,
    peer: ExpectedPeerIdentity
  ): Promise<ProfileResponseMessage> {
    const rawSocket = await openSocket(
      host,
      port,
      this.options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS
    );
    const socket = await secureConnect(rawSocket, {
      selfDevice: this.options.selfDevice as SecureIdentity,
      expectedPeer: peer,
      timeoutMs: this.options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS
    });
    const decoder = new MessageDecoder();

    return await new Promise<ProfileResponseMessage>((resolve, reject) => {
      let settled = false;
      const responseTimeoutMs = this.options.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS;

      const cleanup = (): void => {
        socket.off('data', onData);
        socket.off('error', onError);
        socket.off('close', onClose);
        socket.off('timeout', onTimeout);
        socket.setTimeout(0);
      };

      const fail = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        socket.destroy();
        reject(error);
      };

      const onData = (chunk: Buffer): void => {
        try {
          const messages = decoder.push(chunk);
          for (const message of messages) {
            if (!isProfileResponse(message)) {
              fail(new Error(`unexpected message from peer: ${message.type}`));
              return;
            }
            settled = true;
            cleanup();
            socket.end(() => resolve(message));
            return;
          }
        } catch (error) {
          fail(error as Error);
        }
      };

      const onError = (error: Error): void => fail(error);
      const onClose = (): void => fail(new Error('peer closed connection before profile response'));
      const onTimeout = (): void => fail(new Error('profile request timed out'));

      socket.setTimeout(responseTimeoutMs);
      socket.on('data', onData);
      socket.once('error', onError);
      socket.once('close', onClose);
      socket.once('timeout', onTimeout);
      socket.write(encodeMessage({ type: 'profile-request' }));
    });
  }

  private streamFile(
    socket: SecureSocket,
    filePath: string,
    fileId: string,
    fileName: string,
    totalBytes: number,
    startOffset: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (startOffset >= totalBytes) {
        socket.write(
          encodeMessage({
            type: 'file-complete',
            fileId,
            bytesSent: totalBytes
          }),
          (error?: Error | null) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          }
        );
        return;
      }

      const stream = createReadStream(filePath, { start: startOffset });
      const activeTransfer = this.activeTransfers.get(fileId);
      if (activeTransfer) {
        activeTransfer.stream = stream;
      }
      let bytesTransferred = startOffset;
      let settled = false;

      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        stream.destroy();
        reject(errorForTransferIntent(activeTransfer?.intent ?? null, error));
      };

      stream.on('data', (chunk) => {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const ok = socket.write(data);
        bytesTransferred += data.length;
        this.emit('progress', {
          fileId,
          fileName,
          bytesTransferred,
          totalBytes
        });

        if (!ok) {
          stream.pause();
          socket.once('drain', () => stream.resume());
        }
      });

      stream.once('end', () => {
        socket.write(
          encodeMessage({
            type: 'file-complete',
            fileId,
            bytesSent: bytesTransferred
          }),
          (error?: Error | null) => {
            if (error) {
              fail(error);
              return;
            }
            settled = true;
            resolve();
          }
        );
      });

      stream.once('error', (error) => {
        fail(error);
      });
    });
  }
}

function openSocket(host: string, port: number, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, host);
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onTimeout = (): void => {
      cleanup();
      socket.destroy();
      reject(new Error('connection timed out'));
    };
    const onConnect = (): void => {
      cleanup();
      resolve(socket);
    };
    const cleanup = (): void => {
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
      socket.off('connect', onConnect);
      socket.setTimeout(0);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', onConnect);
    socket.once('error', onError);
    socket.once('timeout', onTimeout);
  });
}

function intentErrorMessage(intent: ActiveTransfer['intent']): string {
  return intent === 'pause' ? 'transfer paused' : 'transfer cancelled';
}

function errorForTransferIntent(
  intent: ActiveTransfer['intent'],
  fallback: Error
): Error {
  if (intent === 'pause') {
    return new Error('transfer paused');
  }
  if (intent === 'cancel') {
    return new Error('transfer cancelled');
  }
  return fallback;
}
