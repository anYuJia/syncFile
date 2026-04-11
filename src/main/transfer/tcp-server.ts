import { createWriteStream, type WriteStream } from 'fs';
import { createServer, type Server, type Socket } from 'net';
import { EventEmitter } from 'events';

import type { Sandbox } from '../storage/sandbox';
import { MessageDecoder, encodeMessage } from './codec';
import {
  isFileCancel,
  isFileComplete,
  isFileOffer,
  type FileCancelMessage,
  type FileCompleteMessage,
  type FileOfferMessage,
  type FileRejectMessage
} from './protocol';

type RejectReason = FileRejectMessage['reason'];

export interface TcpServerOptions {
  sandbox: Sandbox;
}

export interface IncomingOfferInfo {
  offerId: string;
  fileName: string;
  fileSize: number;
  mimeType?: string;
  fromDevice: {
    deviceId: string;
    name: string;
  };
}

export interface OfferResponder {
  accept(): void;
  reject(reason: RejectReason): void;
  cancel(reason: 'receiver-cancelled'): void;
}

export interface TransferCompleteInfo {
  offerId: string;
  savedPath: string;
  bytesReceived: number;
  fromDevice: {
    deviceId: string;
    name: string;
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
  };
}

export interface TcpServerEvents {
  'incoming-offer': (offer: IncomingOfferInfo, respond: OfferResponder) => void;
  progress: (info: ReceiveProgressInfo) => void;
  'transfer-complete': (info: TransferCompleteInfo) => void;
  'transfer-cancelled': (info: ReceiveProgressInfo & { reason: 'sender-cancelled' | 'receiver-cancelled' }) => void;
  'transfer-error': (error: Error) => void;
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
  | 'receiving-file'
  | 'awaiting-complete'
  | 'completed'
  | 'rejected'
  | 'errored';

export class TcpServer extends EventEmitter {
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();
  private readonly activeReceives = new Map<
    string,
      {
        socket: Socket;
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
    this.server = createServer((socket) => this.handleSocket(socket));
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

  private handleSocket(socket: Socket): void {
    this.sockets.add(socket);
    socket.once('close', () => {
      this.sockets.delete(socket);
    });

    const decoder = new MessageDecoder();
    let phase: ConnectionPhase = 'awaiting-offer';
    let offer: FileOfferMessage | null = null;
    let writeStream: WriteStream | null = null;
    let partialPath: string | null = null;
    let finalPath: string | null = null;
    let bytesReceived = 0;
    let bufferedData = Buffer.alloc(0);
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      phase = 'errored';
      writeStream?.destroy(error);
      if (offer) {
        this.activeReceives.delete(offer.fileId);
        this.options.sandbox.discardIncomingResume(offer.fileId, true);
      }
      this.emit('transfer-error', error);
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

      settled = true;
      phase = 'completed';
      const finalOffer = offer;
      writeStream.end(() => {
        this.activeReceives.delete(finalOffer.fileId);
        const savedPath = this.options.sandbox.completeIncomingResume(finalOffer.fileId);
        this.emit('transfer-complete', {
          offerId: finalOffer.fileId,
          savedPath,
          bytesReceived,
          fromDevice: finalOffer.fromDevice
        });
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
      writeStream?.destroy();
      this.activeReceives.delete(offer.fileId);
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
      if (!writeStream) {
        fail(new Error('write stream not initialized'));
        return;
      }

      const ok = writeStream.write(chunk);
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
          offer.fileName,
          offer.fileSize
        );
        partialPath = prepared.partialPath;
        finalPath = prepared.finalPath;
        bytesReceived = prepared.bytesReceived;
        writeStream = createWriteStream(partialPath, { flags: bytesReceived > 0 ? 'a' : 'w' });
        writeStream.once('error', fail);
        this.activeReceives.set(offer.fileId, {
          socket,
          writeStream,
          partialPath,
          finalPath,
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
          })
        );
        phase = 'receiving-file';
        flushBufferedData();
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
          if (!isFileOffer(first)) {
            fail(new Error('expected file-offer as the first message'));
            return;
          }
          if (rest.length > 0) {
            fail(new Error('unexpected extra control messages before file transfer'));
            return;
          }

          offer = first;
          phase = 'awaiting-decision';
          this.emit(
            'incoming-offer',
            {
              offerId: first.fileId,
              fileName: first.fileName,
              fileSize: first.fileSize,
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

      try {
        processData(chunk);
      } catch (error) {
        fail(error as Error);
      }
    });

    socket.on('error', (error) => {
      if (!settled) {
        this.emit('transfer-error', error);
      }
    });

    socket.on('close', () => {
      if (!settled && phase !== 'rejected' && phase !== 'completed') {
        settled = true;
        if (offer) {
          this.activeReceives.delete(offer.fileId);
          this.emit('transfer-cancelled', {
            offerId: offer.fileId,
            fileName: offer.fileName,
            fileSize: offer.fileSize,
            bytesReceived,
            fromDevice: offer.fromDevice,
            reason: 'sender-cancelled'
          });
        } else {
          this.emit('transfer-error', new Error('socket closed before transfer completed'));
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
}
