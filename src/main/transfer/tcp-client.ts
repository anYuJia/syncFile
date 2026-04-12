import { createReadStream, statSync } from 'fs';
import { basename } from 'path';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { connect, type Socket } from 'net';
import type { ReadStream } from 'fs';

import { MessageDecoder, encodeMessage } from './codec';
import { signFileOffer, signPairRequest } from '../security/trust';
import {
  isFileAccept,
  isFileCancel,
  isPairResponse,
  isFileReject,
  type FileOfferMessage,
  type PairRequestMessage
} from './protocol';

export interface TcpClientOptions {
  selfDevice: {
    deviceId: string;
    name: string;
    trustFingerprint: string;
    trustPublicKey: string;
    trustPrivateKey: string;
  };
}

export interface SendFileParams {
  host: string;
  port: number;
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
  socket: Socket;
  stream: ReadStream | null;
  cancelled: boolean;
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
    const transfer = this.activeTransfers.get(fileId);
    if (!transfer) {
      return false;
    }

    transfer.cancelled = true;
    if (!transfer.accepted) {
      try {
        transfer.socket.write(
          encodeMessage({
            type: 'file-cancel',
            fileId,
            reason: 'sender-cancelled'
          }),
          () => transfer.socket.end()
        );
      } catch {
        // Best effort only.
      }
    } else {
      transfer.socket.destroy();
    }
    transfer.stream?.destroy(new Error('transfer cancelled'));
    setTimeout(() => {
      if (!transfer.socket.destroyed) {
        transfer.socket.destroy();
      }
    }, 200);
    return true;
  }

  async sendFile(params: SendFileParams): Promise<SendFileResult> {
    const stats = statSync(params.filePath);
    const fileId = params.fileId ?? randomUUID();
    const fileName = basename(params.filePath);
    const socket = await openSocket(params.host, params.port);
    const decoder = new MessageDecoder();

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

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const activeTransfer: ActiveTransfer = {
        socket,
        stream: null,
        cancelled: false,
        accepted: false
      };
      this.activeTransfers.set(fileId, activeTransfer);

      const cleanup = (): void => {
        this.activeTransfers.delete(fileId);
        socket.off('data', onData);
        socket.off('error', onError);
        socket.off('close', onClose);
      };

      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        cleanup();
        socket.destroy();
        reject(activeTransfer.cancelled ? new Error('transfer cancelled') : error);
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
              activeTransfer.cancelled = true;
              fail(new Error(`peer cancelled transfer: ${message.reason}`));
              return;
            }

            if (isFileReject(message) && message.fileId === fileId) {
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

      socket.on('data', onData);
      socket.once('error', onError);
      socket.once('close', onClose);
      socket.write(encodeMessage(offer));
    });

    return {
      fileId,
      fileName,
      totalBytes: stats.size
    };
  }

  async pairWithPeer(host: string, port: number): Promise<boolean> {
    const socket = await openSocket(host, port);
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
      const cleanup = (): void => {
        socket.off('data', onData);
        socket.off('error', onError);
        socket.off('close', onClose);
      };

      const onData = (chunk: Buffer): void => {
        try {
          const messages = decoder.push(chunk);
          for (const message of messages) {
            if (isPairResponse(message) && message.requestId === request.requestId) {
              cleanup();
              socket.end(() => resolve(message.accepted));
              return;
            }
          }
        } catch (error) {
          cleanup();
          socket.destroy();
          reject(error as Error);
        }
      };

      const onError = (error: Error): void => {
        cleanup();
        reject(error);
      };

      const onClose = (): void => {
        cleanup();
      };

      socket.on('data', onData);
      socket.once('error', onError);
      socket.once('close', onClose);
      socket.write(encodeMessage(request));
    });
  }

  private streamFile(
    socket: Socket,
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
        reject(activeTransfer?.cancelled ? new Error('transfer cancelled') : error);
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

function openSocket(host: string, port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, host);
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
  });
}
