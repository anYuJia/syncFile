import { createHash, type Hash } from 'crypto';
import { createReadStream, createWriteStream, rmSync, type WriteStream } from 'fs';
import { createServer, type Server, type Socket } from 'net';
import { EventEmitter } from 'events';

import type { Sandbox } from '../storage/sandbox';
import { secureAccept, type SecureIdentity, type SecureSocket } from './secure-channel';
import { verifyFileOffer, verifyPairRequest } from '../security/trust';
import { logError, logInfo, logWarn } from '../logging/runtime-log';
import { MessageDecoder, encodeMessage } from './codec';
import {
  isFileCancel,
  isFileComplete,
  isFileOffer,
  isPairRequest,
  type FileCancelMessage,
  type FileCompleteMessage,
  type FileOfferMessage,
  type FileRejectMessage,
  type PairRequestMessage
} from './protocol';
import { PAIR_REQUEST_MAX_AGE_MS } from '../security/trust';

type RejectReason = FileRejectMessage['reason'];
const DEFAULT_IDLE_TIMEOUT_MS = 120000;
const DEFAULT_DECISION_TIMEOUT_MS = 180000;

export interface TcpServerOptions {
  sandbox: Sandbox;
  selfDevice: SecureIdentity;
}

export interface IncomingOfferInfo {
  offerId: string;
  fileName: string;
  fileSize: number;
  sha256?: string;
  mimeType?: string;
  fromDevice: {
    deviceId: string;
    name: string;
    trustFingerprint: string;
    trustPublicKey: string;
  };
}

export interface OfferResponder {
  accept(): void;
  reject(reason: RejectReason): void;
  cancel(reason: 'receiver-cancelled'): void;
}

export interface PairResponder {
  accept(): void;
  reject(): void;
}

export interface TransferCompleteInfo {
  offerId: string;
  savedPath: string;
  bytesReceived: number;
  fromDevice: {
    deviceId: string;
    name: string;
    trustFingerprint: string;
    trustPublicKey: string;
  };
}

export interface ReceiveProgressInfo {
  offerId: string;
  fileName: string;
  fileSize: number;
  bytesReceived: number;
  fromDevice: {
    deviceId: string;
    name: string;
    trustFingerprint: string;
    trustPublicKey: string;
  };
}

export interface ReceiveInterruptedInfo extends ReceiveProgressInfo {
  reason: 'sender-paused' | 'sender-disconnected';
  localPath?: string;
}

export interface TransferErrorInfo {
  error: Error;
  offerId?: string;
  fileName?: string;
  fileSize?: number;
  fromDevice?: {
    deviceId: string;
    name: string;
    trustFingerprint: string;
    trustPublicKey: string;
  };
  bytesReceived?: number;
  localPath?: string;
}

export interface TcpServerEvents {
  'incoming-offer': (offer: IncomingOfferInfo, respond: OfferResponder) => void;
  'pair-request': (request: PairRequestMessage, respond: PairResponder) => void;
  'pair-request-closed': (requestId: string) => void;
  progress: (info: ReceiveProgressInfo) => void;
  'transfer-complete': (info: TransferCompleteInfo) => void;
  'transfer-paused': (info: ReceiveInterruptedInfo) => void;
  'transfer-cancelled': (info: ReceiveProgressInfo & { reason: 'sender-cancelled' | 'receiver-cancelled' }) => void;
  'transfer-error': (info: TransferErrorInfo) => void;
}

export declare interface TcpServer {
  on<K extends keyof TcpServerEvents>(event: K, listener: TcpServerEvents[K]): this;
  once<K extends keyof TcpServerEvents>(event: K, listener: TcpServerEvents[K]): this;
  off<K extends keyof TcpServerEvents>(event: K, listener: TcpServerEvents[K]): this;
  emit<K extends keyof TcpServerEvents>(
    event: K,
    ...args: Parameters<TcpServerEvents[K]>
  ): boolean;
}

type ConnectionPhase =
  | 'awaiting-offer'
  | 'awaiting-decision'
  | 'preparing-receive'
  | 'receiving-file'
  | 'awaiting-complete'
  | 'completed'
  | 'rejected'
  | 'errored';

export class TcpServer extends EventEmitter {
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();
  private readonly recentPairRequests = new Map<string, number>();
  private readonly activeReceives = new Map<
    string,
      {
        socket: SecureSocket;
        writeStream: WriteStream | null;
        partialPath: string | null;
        finalPath: string | null;
        bytesReceived: number;
        fromDevice: IncomingOfferInfo['fromDevice'];
        fileName: string;
        fileSize: number;
      }
  >();

  constructor(private readonly options: TcpServerOptions) {
    super();
    this.server = createServer((socket) => this.handleConnection(socket));
  }

  listen(port = 43434): Promise<number> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error) => {
        this.server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        this.server.off('error', onError);
        const address = this.server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('unexpected server address'));
          return;
        }
        resolve(address.port);
      };

      this.server.once('error', onError);
      this.server.once('listening', onListening);
      this.server.listen(port);
    });
  }

  close(): Promise<void> {
    for (const socket of this.sockets) {
      socket.destroy();
    }

    if (!this.server.listening) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }

  private handleConnection(socket: Socket): void {
    this.sockets.add(socket);
    socket.once('close', () => {
      this.sockets.delete(socket);
    });

    void secureAccept(socket, {
      selfDevice: this.options.selfDevice
    })
      .then(({ socket: secureSocket }) => {
        logInfo('transfer', 'accepted secure peer connection');
        this.handleSocket(secureSocket);
      })
      .catch((error) => {
        logWarn('transfer', 'secure accept failed', error);
        if (!socket.destroyed) {
          socket.destroy();
        }
      });
  }

  private handleSocket(socket: SecureSocket): void {

    const decoder = new MessageDecoder();
    let phase: ConnectionPhase = 'awaiting-offer';
    let offer: FileOfferMessage | null = null;
    let writeStream: WriteStream | null = null;
    let fileHash: Hash | null = null;
    let partialPath: string | null = null;
    let finalPath: string | null = null;
    let bytesReceived = 0;
    let bufferedData = Buffer.alloc(0);
    let settled = false;
    let socketError: Error | null = null;
    let pendingPairRequestId: string | null = null;
    let pairRequestResolved = false;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      phase = 'errored';
      writeStream?.destroy(error);
      if (offer) {
        this.activeReceives.delete(offer.fileId);
        this.options.sandbox.discardIncomingResume(offer.fileId, true);
      }
      this.emit('transfer-error', {
        error,
        offerId: offer?.fileId,
        fileName: offer?.fileName,
        fileSize: offer?.fileSize,
        fromDevice: offer?.fromDevice,
        bytesReceived,
        localPath: partialPath ?? undefined
      });
      socket.destroy();
    };

    const finalize = (message: FileCompleteMessage): void => {
      if (!offer || !writeStream || !partialPath) {
        fail(new Error('cannot finalize transfer before file stream is ready'));
        return;
      }
      if (message.fileId !== offer.fileId) {
        fail(new Error(`unexpected file-complete for ${message.fileId}`));
        return;
      }
      if (message.bytesSent !== bytesReceived) {
        fail(
          new Error(`file size mismatch: sender reported ${message.bytesSent}, received ${bytesReceived}`)
        );
        return;
      }
      if (settled) return;

      phase = 'completed';
      const finalOffer = offer;
      writeStream.end(() => {
        try {
          const digest = fileHash?.digest('hex');
          fileHash = null;
          this.activeReceives.delete(finalOffer.fileId);
          const savedPath = this.options.sandbox.completeIncomingResume(finalOffer.fileId);
          if (finalOffer.sha256 && finalOffer.sha256 !== digest) {
            rmSync(savedPath, { force: true });
            settled = true;
            this.emit('transfer-error', {
              error: new Error('received file failed integrity verification'),
              offerId: finalOffer.fileId,
              fileName: finalOffer.fileName,
              fileSize: finalOffer.fileSize,
              fromDevice: finalOffer.fromDevice,
              bytesReceived
            });
            return;
          }
          settled = true;
          this.emit('transfer-complete', {
            offerId: finalOffer.fileId,
            savedPath,
            bytesReceived,
            fromDevice: finalOffer.fromDevice
          });
        } catch (error) {
          if (finalOffer.fileId) {
            this.activeReceives.delete(finalOffer.fileId);
          }
          if (finalPath) {
            rmSync(finalPath, { force: true });
          }
          this.options.sandbox.discardIncomingResume(finalOffer.fileId, true);
          settled = true;
          this.emit('transfer-error', {
            error: error as Error,
            offerId: finalOffer.fileId,
            fileName: finalOffer.fileName,
            fileSize: finalOffer.fileSize,
            fromDevice: finalOffer.fromDevice,
            bytesReceived
          });
        }
      });
    };

    const handleControlChunk = (chunk: Buffer): void => {
      const messages = decoder.push(chunk);
      for (const message of messages) {
        if (isFileCancel(message)) {
          handleCancel(message);
          continue;
        }
        if (isFileComplete(message)) {
          finalize(message);
          continue;
        }
        fail(new Error(`unexpected control message: ${message.type}`));
        return;
      }
    };

    const handleCancel = (message: FileCancelMessage): void => {
      if (!offer || message.fileId !== offer.fileId || settled) {
        return;
      }
      settled = true;
      phase = 'rejected';
      this.activeReceives.delete(offer.fileId);
      if (message.reason === 'sender-paused') {
        writeStream?.end();
        this.emit('transfer-paused', {
          offerId: offer.fileId,
          fileName: offer.fileName,
          fileSize: offer.fileSize,
          bytesReceived,
          fromDevice: offer.fromDevice,
          reason: 'sender-paused',
          localPath: partialPath ?? undefined
        });
        socket.destroy();
        return;
      }
      writeStream?.destroy();
      this.options.sandbox.discardIncomingResume(offer.fileId, true);
      this.emit('transfer-cancelled', {
        offerId: offer.fileId,
        fileName: offer.fileName,
        fileSize: offer.fileSize,
        bytesReceived,
        fromDevice: offer.fromDevice,
        reason: message.reason
      });
      socket.destroy();
    };

    const writeFileBytes = (chunk: Buffer): void => {
      if (!writeStream || !fileHash) {
        fail(new Error('receive stream not initialized'));
        return;
      }

      fileHash.update(chunk);
      const ok = writeStream.write(chunk);
      this.options.sandbox.markUsageDirty();
      if (!ok) {
        socket.pause();
        writeStream.once('drain', () => socket.resume());
      }
    };

    const flushBufferedData = (): void => {
      if (bufferedData.length === 0 || phase === 'awaiting-decision') {
        return;
      }
      const queued = bufferedData;
      bufferedData = Buffer.alloc(0);
      processData(queued);
    };

    const processData = (chunk: Buffer): void => {
      if (!offer) {
        fail(new Error('received data before file offer'));
        return;
      }

      if (phase === 'awaiting-complete') {
        handleControlChunk(chunk);
        return;
      }

      if (phase !== 'receiving-file') {
        fail(new Error(`unexpected data while ${phase}`));
        return;
      }

      let offset = 0;
      while (offset < chunk.length) {
        const bytesRemaining = offer.fileSize - bytesReceived;
        if (bytesRemaining > 0) {
          const take = Math.min(bytesRemaining, chunk.length - offset);
          const fileChunk = chunk.subarray(offset, offset + take);
          writeFileBytes(fileChunk);
          bytesReceived += take;
          const active = this.activeReceives.get(offer.fileId);
          if (active) {
            active.bytesReceived = bytesReceived;
          }
          this.emit('progress', {
            offerId: offer.fileId,
            fileName: offer.fileName,
            fileSize: offer.fileSize,
            bytesReceived,
            fromDevice: offer.fromDevice
          });
          offset += take;
          if (bytesReceived < offer.fileSize) {
            return;
          }
          phase = 'awaiting-complete';
        }

        if (offset < chunk.length) {
          handleControlChunk(chunk.subarray(offset));
          return;
        }
      }
    };

    const responder: OfferResponder = {
      accept: () => {
        if (!offer || phase !== 'awaiting-decision') {
          return;
        }
        const prepared = this.options.sandbox.prepareIncomingResume(
          offer.fileId,
          offer.fromDevice.deviceId,
          offer.fromDevice.name,
          offer.fromDevice.trustFingerprint,
          offer.fromDevice.trustPublicKey,
          offer.fileName,
          offer.fileSize,
          offer.sha256 ?? ''
        );
        partialPath = prepared.partialPath;
        finalPath = prepared.finalPath;
        bytesReceived = prepared.bytesReceived;
        phase = 'preparing-receive';
        void seedHashForResume(prepared.partialPath, bytesReceived)
          .then((nextHash) => {
            if (!offer || settled || phase !== 'preparing-receive') {
              return;
            }

            fileHash = nextHash;
            writeStream = createWriteStream(prepared.partialPath, { flags: bytesReceived > 0 ? 'a' : 'w' });
            writeStream.once('error', fail);
            this.activeReceives.set(offer.fileId, {
              socket,
              writeStream,
              partialPath: prepared.partialPath,
              finalPath: prepared.finalPath,
              bytesReceived,
              fromDevice: offer.fromDevice,
              fileName: offer.fileName,
              fileSize: offer.fileSize
            });

            socket.write(
              encodeMessage({
                type: 'file-accept',
                fileId: offer.fileId,
                startOffset: bytesReceived
              }),
              (error?: Error | null) => {
                if (error) {
                  fail(error);
                  return;
                }
                phase = 'receiving-file';
                socket.setTimeout(DEFAULT_IDLE_TIMEOUT_MS);
                flushBufferedData();
              }
            );
          })
          .catch((error) => fail(error as Error));
      },
      reject: (reason) => {
        if (!offer || phase !== 'awaiting-decision') {
          return;
        }
        settled = true;
        phase = 'rejected';
        socket.write(encodeMessage({ type: 'file-reject', fileId: offer.fileId, reason }));
        socket.destroySoon();
      },
      cancel: (reason) => {
        if (!offer || (phase !== 'awaiting-decision' && phase !== 'receiving-file' && phase !== 'awaiting-complete')) {
          return;
        }
        settled = true;
        phase = 'rejected';
        writeStream?.destroy();
        this.activeReceives.delete(offer.fileId);
        this.options.sandbox.discardIncomingResume(offer.fileId, true);
        socket.write(encodeMessage({ type: 'file-cancel', fileId: offer.fileId, reason }));
        socket.destroySoon();
      }
    };

    socket.on('data', (chunk) => {
      if (phase === 'awaiting-offer') {
        try {
          const { messages, remainder } = decoder.pushWithRemainder(chunk);
          if (messages.length === 0) {
            return;
          }
          const [first, ...rest] = messages;
          if (isPairRequest(first)) {
            if (!verifyPairRequest(first)) {
              settled = true;
              phase = 'completed';
              socket.end();
              return;
            }
            if (this.isReplayPairRequest(first.requestId, first.timestamp)) {
              settled = true;
              phase = 'completed';
              socket.end();
              return;
            }
            pendingPairRequestId = first.requestId;
            settled = true;
            phase = 'completed';
            logInfo('pairing', 'received pair request', {
              requestId: first.requestId,
              peerDeviceId: first.fromDevice.deviceId,
              peerDeviceName: first.fromDevice.name
            });
            const pairResponder: PairResponder = {
              accept: () => {
                if (pairRequestResolved || socket.destroyed) {
                  return;
                }
                pairRequestResolved = true;
                socket.write(
                  encodeMessage({
                    type: 'pair-response',
                    requestId: first.requestId,
                    accepted: true
                  }),
                  () => socket.end()
                );
              },
              reject: () => {
                if (pairRequestResolved || socket.destroyed) {
                  return;
                }
                pairRequestResolved = true;
                socket.write(
                  encodeMessage({
                    type: 'pair-response',
                    requestId: first.requestId,
                    accepted: false
                  }),
                  () => socket.end()
                );
              }
            };
            this.emit('pair-request', first, pairResponder);
            return;
          }
          if (!isFileOffer(first)) {
            fail(new Error('expected file-offer as the first message'));
            return;
          }
          if (!verifyFileOffer(first)) {
            settled = true;
            phase = 'rejected';
            socket.write(
              encodeMessage({
                type: 'file-reject',
                fileId: first.fileId,
                reason: 'identity-mismatch'
              })
            );
            socket.destroySoon();
            return;
          }
          if (rest.length > 0) {
            fail(new Error('unexpected extra control messages before file transfer'));
            return;
          }

          offer = first;
          phase = 'awaiting-decision';
          logInfo('transfer', 'received file offer and waiting for local decision', {
            offerId: first.fileId,
            fileName: first.fileName,
            fileSize: first.fileSize,
            peerDeviceId: first.fromDevice.deviceId,
            peerDeviceName: first.fromDevice.name
          });
          this.emit(
            'incoming-offer',
            {
              offerId: first.fileId,
              fileName: first.fileName,
              fileSize: first.fileSize,
              sha256: first.sha256,
              mimeType: first.mimeType,
              fromDevice: first.fromDevice
            },
            responder
          );

          const phaseAfterOffer = phase as ConnectionPhase;
          if (remainder.length > 0) {
            if (phaseAfterOffer === 'receiving-file' || phaseAfterOffer === 'awaiting-complete') {
              processData(remainder);
            } else {
              bufferedData = Buffer.concat([bufferedData, remainder]);
            }
          }
        } catch (error) {
          fail(error as Error);
        }
        return;
      }

      if (phase === 'awaiting-decision') {
        try {
          const messages = decoder.push(chunk);
          for (const message of messages) {
            if (isFileCancel(message)) {
              handleCancel(message);
              return;
            }
          }
          fail(new Error('received file data before the offer was accepted'));
        } catch (error) {
          fail(error as Error);
        }
        return;
      }

      if (phase === 'preparing-receive') {
        bufferedData = Buffer.concat([bufferedData, chunk]);
        return;
      }

      try {
        processData(chunk);
      } catch (error) {
        fail(error as Error);
      }
    });

    socket.setTimeout(DEFAULT_DECISION_TIMEOUT_MS);
    socket.on('timeout', () => {
      socketError = new Error(
        phase === 'awaiting-decision' ? 'receiver did not respond in time' : 'transfer timed out'
      );
      logWarn('transfer', 'secure socket timed out', {
        phase,
        offerId: offer?.fileId,
        fileName: offer?.fileName
      });
      socket.destroy();
    });

    socket.on('error', (error) => {
      logError('transfer', 'secure socket error', error);
      socketError = error;
    });

    socket.on('close', () => {
      if (pendingPairRequestId && !pairRequestResolved) {
        pairRequestResolved = true;
        this.emit('pair-request-closed', pendingPairRequestId);
      }
      if (!settled && phase !== 'rejected' && phase !== 'completed') {
        settled = true;
        if (offer) {
          this.activeReceives.delete(offer.fileId);
          if (
            (phase === 'receiving-file' || phase === 'awaiting-complete') &&
            bytesReceived < offer.fileSize
          ) {
            writeStream?.end();
            this.emit('transfer-paused', {
              offerId: offer.fileId,
              fileName: offer.fileName,
              fileSize: offer.fileSize,
              bytesReceived,
              fromDevice: offer.fromDevice,
              reason: 'sender-disconnected',
              localPath: partialPath ?? undefined
            });
            return;
          }
          this.emit('transfer-error', {
            error: socketError ?? new Error('sender disconnected before transfer completed'),
            offerId: offer.fileId,
            fileName: offer.fileName,
            fileSize: offer.fileSize,
            bytesReceived,
            fromDevice: offer.fromDevice,
            localPath: partialPath ?? undefined
          });
        } else {
          this.emit('transfer-error', {
            error: socketError ?? new Error('socket closed before transfer completed'),
            bytesReceived,
            localPath: partialPath ?? undefined
          });
        }
        writeStream?.end();
      }
    });
  }

  cancel(offerId: string): boolean {
    const active = this.activeReceives.get(offerId);
    if (!active) {
      return false;
    }

    active.writeStream?.destroy();
    this.options.sandbox.discardIncomingResume(offerId, true);
    try {
      active.socket.write(
        encodeMessage({
          type: 'file-cancel',
          fileId: offerId,
          reason: 'receiver-cancelled'
        })
      );
    } catch {
      // Best effort only.
    }
    active.socket.destroy();
    this.activeReceives.delete(offerId);
    this.emit('transfer-cancelled', {
      offerId,
      fileName: active.fileName,
      fileSize: active.fileSize,
      bytesReceived: active.bytesReceived,
      fromDevice: active.fromDevice,
      reason: 'receiver-cancelled'
    });
    return true;
  }

  private isReplayPairRequest(requestId: string, timestamp: number): boolean {
    const cutoff = timestamp - PAIR_REQUEST_MAX_AGE_MS;
    for (const [knownRequestId, seenAt] of this.recentPairRequests.entries()) {
      if (seenAt < cutoff) {
        this.recentPairRequests.delete(knownRequestId);
      }
    }

    if (this.recentPairRequests.has(requestId)) {
      return true;
    }

    this.recentPairRequests.set(requestId, timestamp);
    return false;
  }
}

function seedHashForResume(partialPath: string, existingBytes: number): Promise<Hash> {
  const hash = createHash('sha256');
  if (existingBytes <= 0) {
    return Promise.resolve(hash);
  }

  return new Promise<Hash>((resolve, reject) => {
    const stream = createReadStream(partialPath);
    stream.on('data', (chunk) => {
      hash.update(chunk);
    });
    stream.once('end', () => resolve(hash));
    stream.once('error', reject);
  });
}
