import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign,
  verify
} from 'crypto';
import { EventEmitter } from 'events';
import type { Socket } from 'net';
import type { KeyObject } from 'crypto';

import { MAX_CONTROL_MESSAGE_BYTES } from './codec';
import { fingerprintForPublicKey } from '../security/trust';

const FRAME_HEADER_BYTES = 4;
const AUTH_TAG_BYTES = 16;
const MAX_SECURE_FRAME_BYTES = 1024 * 1024;
const HANDSHAKE_VERSION = 1 as const;
const HANDSHAKE_TIMEOUT_MS = 8000;

export interface SecureIdentity {
  deviceId: string;
  name: string;
  trustFingerprint: string;
  trustPublicKey: string;
  trustPrivateKey: string;
}

export interface ExpectedPeerIdentity {
  deviceId?: string;
  trustFingerprint: string;
  trustPublicKey?: string;
}

interface SessionKeys {
  sendKey: Buffer;
  receiveKey: Buffer;
  sendNoncePrefix: Buffer;
  receiveNoncePrefix: Buffer;
}

interface UnsignedClientHello {
  type: 'secure-client-hello';
  version: typeof HANDSHAKE_VERSION;
  clientEphemeralPublicKey: string;
  clientNonce: string;
  fromDevice: {
    deviceId: string;
    name: string;
    trustFingerprint: string;
    trustPublicKey: string;
  };
}

interface ClientHello extends UnsignedClientHello {
  signature: string;
}

interface UnsignedServerHello {
  type: 'secure-server-hello';
  version: typeof HANDSHAKE_VERSION;
  clientEphemeralPublicKey: string;
  clientNonce: string;
  serverEphemeralPublicKey: string;
  serverNonce: string;
  fromDevice: {
    deviceId: string;
    name: string;
    trustFingerprint: string;
    trustPublicKey: string;
  };
}

interface ServerHello extends UnsignedServerHello {
  signature: string;
}

type HandshakeMessage = ClientHello | ServerHello;

export class SecureSocket extends EventEmitter {
  private encryptedBuffer = Buffer.alloc(0);
  private sendCounter = 0n;
  private receiveCounter = 0n;

  constructor(
    private readonly socket: Socket,
    private readonly keys: SessionKeys
  ) {
    super();
    this.socket.on('data', this.handleEncryptedData);
    this.socket.on('drain', () => this.emit('drain'));
    this.socket.on('timeout', () => this.emit('timeout'));
    this.socket.on('error', (error) => this.emit('error', error));
    this.socket.on('end', () => this.emit('end'));
    this.socket.on('close', (hadError) => this.emit('close', hadError));
    this.socket.on('connect', () => this.emit('connect'));
  }

  write(data: string | Buffer | Uint8Array, callback?: (error?: Error | null) => void): boolean {
    const plaintext = asBuffer(data);
    if (plaintext.length > MAX_SECURE_FRAME_BYTES) {
      throw new RangeError(`Secure frame exceeds ${MAX_SECURE_FRAME_BYTES} bytes`);
    }

    const nonce = nonceForCounter(this.keys.sendNoncePrefix, this.sendCounter);
    this.sendCounter += 1n;

    const cipher = createCipheriv('aes-256-gcm', this.keys.sendKey, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payloadLength = ciphertext.length + authTag.length;
    const frame = Buffer.allocUnsafe(FRAME_HEADER_BYTES + payloadLength);
    frame.writeUInt32BE(payloadLength, 0);
    ciphertext.copy(frame, FRAME_HEADER_BYTES);
    authTag.copy(frame, FRAME_HEADER_BYTES + ciphertext.length);
    return this.socket.write(frame, callback);
  }

  end(callback?: () => void): this;
  end(data: string | Buffer | Uint8Array, callback?: () => void): this;
  end(
    dataOrCallback?: string | Buffer | Uint8Array | (() => void),
    callback?: () => void
  ): this {
    if (typeof dataOrCallback === 'function') {
      this.socket.end(dataOrCallback);
      return this;
    }

    if (dataOrCallback !== undefined) {
      this.write(dataOrCallback, (error) => {
        if (error) {
          callback?.();
          return;
        }
        this.socket.end(callback);
      });
      return this;
    }

    this.socket.end(callback);
    return this;
  }

  destroy(error?: Error): this {
    this.socket.destroy(error);
    return this;
  }

  destroySoon(): void {
    this.socket.end();
    setTimeout(() => {
      if (!this.socket.destroyed) {
        this.socket.destroy();
      }
    }, 200);
  }

  pause(): this {
    this.socket.pause();
    return this;
  }

  resume(): this {
    this.socket.resume();
    return this;
  }

  setTimeout(timeout: number): this {
    this.socket.setTimeout(timeout);
    return this;
  }

  get destroyed(): boolean {
    return this.socket.destroyed;
  }

  private readonly handleEncryptedData = (chunk: Buffer): void => {
    this.encryptedBuffer = Buffer.concat([this.encryptedBuffer, chunk]);

    while (this.encryptedBuffer.length >= FRAME_HEADER_BYTES) {
      const frameLength = this.encryptedBuffer.readUInt32BE(0);
      if (frameLength <= AUTH_TAG_BYTES || frameLength > MAX_SECURE_FRAME_BYTES + AUTH_TAG_BYTES) {
        this.emit('error', new Error('invalid secure frame length'));
        this.destroy();
        return;
      }

      const totalLength = FRAME_HEADER_BYTES + frameLength;
      if (this.encryptedBuffer.length < totalLength) {
        return;
      }

      const frame = this.encryptedBuffer.subarray(FRAME_HEADER_BYTES, totalLength);
      this.encryptedBuffer = this.encryptedBuffer.subarray(totalLength);
      try {
        const ciphertext = frame.subarray(0, frame.length - AUTH_TAG_BYTES);
        const authTag = frame.subarray(frame.length - AUTH_TAG_BYTES);
        const nonce = nonceForCounter(this.keys.receiveNoncePrefix, this.receiveCounter);
        this.receiveCounter += 1n;

        const decipher = createDecipheriv('aes-256-gcm', this.keys.receiveKey, nonce);
        decipher.setAuthTag(authTag);
        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        this.emit('data', plaintext);
      } catch (error) {
        this.emit('error', error instanceof Error ? error : new Error('failed to decrypt secure frame'));
        this.destroy();
        return;
      }
    }
  };
}

export async function secureConnect(
  socket: Socket,
  options: {
    selfDevice: SecureIdentity;
    expectedPeer: ExpectedPeerIdentity;
    timeoutMs?: number;
  }
): Promise<SecureSocket> {
  const timeoutMs = options.timeoutMs ?? HANDSHAKE_TIMEOUT_MS;
  const ephemeral = generateKeyPairSync('x25519');
  const unsignedHello: UnsignedClientHello = {
    type: 'secure-client-hello',
    version: HANDSHAKE_VERSION,
    clientEphemeralPublicKey: exportPublicKey(ephemeral.publicKey),
    clientNonce: randomBytes(16).toString('base64'),
    fromDevice: publicIdentity(options.selfDevice)
  };
  const hello: ClientHello = {
    ...unsignedHello,
    signature: signHandshakePayload(clientHelloPayload(unsignedHello), options.selfDevice.trustPrivateKey)
  };

  return await new Promise<SecureSocket>((resolve, reject) => {
    const decoder = new HandshakeDecoder();
    let timer: NodeJS.Timeout | null = setTimeout(() => {
      timer = null;
      fail(new Error('secure handshake timed out'));
    }, timeoutMs);

    const cleanup = (): void => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
      socket.off('timeout', onTimeout);
      socket.setTimeout(0);
    };

    const fail = (error: Error): void => {
      cleanup();
      socket.destroy();
      reject(error);
    };

    const onData = (chunk: Buffer): void => {
      try {
        const messages = decoder.push(chunk);
        if (messages.length > 1) {
          fail(new Error('unexpected extra secure handshake frames'));
          return;
        }
        for (const message of messages) {
          if (!isServerHello(message)) {
            fail(new Error('expected secure-server-hello'));
            return;
          }
          verifyServerHello(message, unsignedHello, options.expectedPeer);
          cleanup();
          resolve(
            new SecureSocket(
              socket,
              deriveSessionKeys({
                role: 'client',
                privateKey: ephemeral.privateKey,
                remoteEphemeralPublicKey: message.serverEphemeralPublicKey,
                clientHello: unsignedHello,
                serverHello: message
              })
            )
          );
          return;
        }
      } catch (error) {
        fail(error instanceof Error ? error : new Error('secure handshake failed'));
      }
    };

    const onError = (error: Error): void => fail(error);
    const onClose = (): void => fail(new Error('peer closed during secure handshake'));
    const onTimeout = (): void => fail(new Error('secure handshake timed out'));

    socket.setTimeout(timeoutMs);
    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('close', onClose);
    socket.once('timeout', onTimeout);
    socket.write(encodeHandshakeFrame(hello));
  });
}

export async function secureAccept(
  socket: Socket,
  options: {
    selfDevice: SecureIdentity;
    timeoutMs?: number;
  }
): Promise<{ socket: SecureSocket; peer: ExpectedPeerIdentity & { name: string } }> {
  const timeoutMs = options.timeoutMs ?? HANDSHAKE_TIMEOUT_MS;

  return await new Promise((resolve, reject) => {
    const decoder = new HandshakeDecoder();
    let timer: NodeJS.Timeout | null = setTimeout(() => {
      timer = null;
      fail(new Error('secure handshake timed out'));
    }, timeoutMs);

    const cleanup = (): void => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
      socket.off('timeout', onTimeout);
      socket.setTimeout(0);
    };

    const fail = (error: Error): void => {
      cleanup();
      socket.destroy();
      reject(error);
    };

    const onData = (chunk: Buffer): void => {
      try {
        const messages = decoder.push(chunk);
        if (messages.length > 1) {
          fail(new Error('unexpected extra secure handshake frames'));
          return;
        }
        for (const message of messages) {
          if (!isClientHello(message)) {
            fail(new Error('expected secure-client-hello'));
            return;
          }
          verifyClientHello(message);

          const ephemeral = generateKeyPairSync('x25519');
          const unsignedHello: UnsignedServerHello = {
            type: 'secure-server-hello',
            version: HANDSHAKE_VERSION,
            clientEphemeralPublicKey: message.clientEphemeralPublicKey,
            clientNonce: message.clientNonce,
            serverEphemeralPublicKey: exportPublicKey(ephemeral.publicKey),
            serverNonce: randomBytes(16).toString('base64'),
            fromDevice: publicIdentity(options.selfDevice)
          };
          const hello: ServerHello = {
            ...unsignedHello,
            signature: signHandshakePayload(serverHelloPayload(unsignedHello), options.selfDevice.trustPrivateKey)
          };
          socket.write(encodeHandshakeFrame(hello));
          cleanup();
          resolve({
            socket: new SecureSocket(
              socket,
              deriveSessionKeys({
                role: 'server',
                privateKey: ephemeral.privateKey,
                remoteEphemeralPublicKey: message.clientEphemeralPublicKey,
                clientHello: message,
                serverHello: unsignedHello
              })
            ),
            peer: {
              deviceId: message.fromDevice.deviceId,
              name: message.fromDevice.name,
              trustFingerprint: message.fromDevice.trustFingerprint,
              trustPublicKey: message.fromDevice.trustPublicKey
            }
          });
          return;
        }
      } catch (error) {
        fail(error instanceof Error ? error : new Error('secure handshake failed'));
      }
    };

    const onError = (error: Error): void => fail(error);
    const onClose = (): void => fail(new Error('peer closed during secure handshake'));
    const onTimeout = (): void => fail(new Error('secure handshake timed out'));

    socket.setTimeout(timeoutMs);
    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('close', onClose);
    socket.once('timeout', onTimeout);
  });
}

function publicIdentity(identity: SecureIdentity): UnsignedClientHello['fromDevice'] {
  return {
    deviceId: identity.deviceId,
    name: identity.name,
    trustFingerprint: identity.trustFingerprint,
    trustPublicKey: identity.trustPublicKey
  };
}

function encodeHandshakeFrame(message: HandshakeMessage): Buffer {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  if (payload.length > MAX_CONTROL_MESSAGE_BYTES) {
    throw new RangeError(`Handshake exceeds ${MAX_CONTROL_MESSAGE_BYTES} bytes`);
  }
  const frame = Buffer.allocUnsafe(FRAME_HEADER_BYTES + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, FRAME_HEADER_BYTES);
  return frame;
}

class HandshakeDecoder {
  private buffer = Buffer.alloc(0);

  push(chunk: Buffer): HandshakeMessage[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: HandshakeMessage[] = [];

    while (this.buffer.length >= FRAME_HEADER_BYTES) {
      const payloadLength = this.buffer.readUInt32BE(0);
      if (payloadLength > MAX_CONTROL_MESSAGE_BYTES) {
        throw new RangeError(`Handshake exceeds ${MAX_CONTROL_MESSAGE_BYTES} bytes`);
      }
      const totalLength = FRAME_HEADER_BYTES + payloadLength;
      if (this.buffer.length < totalLength) {
        break;
      }
      const payload = this.buffer.subarray(FRAME_HEADER_BYTES, totalLength);
      this.buffer = this.buffer.subarray(totalLength);
      const parsed = JSON.parse(payload.toString('utf8')) as HandshakeMessage;
      messages.push(parsed);
    }

    return messages;
  }
}

function verifyClientHello(message: HandshakeMessage): asserts message is ClientHello {
  if (!isClientHello(message)) {
    throw new Error('invalid client hello');
  }
  verifySignedIdentity(message.fromDevice.trustPublicKey, message.fromDevice.trustFingerprint, message.signature);
  if (
    !verifyHandshakePayload(
      clientHelloPayload({
        type: message.type,
        version: message.version,
        clientEphemeralPublicKey: message.clientEphemeralPublicKey,
        clientNonce: message.clientNonce,
        fromDevice: message.fromDevice
      }),
      message.fromDevice.trustPublicKey,
      message.signature
    )
  ) {
    throw new Error('client hello signature mismatch');
  }
}

function verifyServerHello(
  message: HandshakeMessage,
  clientHello: UnsignedClientHello,
  expectedPeer: ExpectedPeerIdentity
): asserts message is ServerHello {
  if (!isServerHello(message)) {
    throw new Error('invalid server hello');
  }
  verifySignedIdentity(message.fromDevice.trustPublicKey, message.fromDevice.trustFingerprint, message.signature);
  if (expectedPeer.deviceId && message.fromDevice.deviceId !== expectedPeer.deviceId) {
    throw new Error('server device id mismatch');
  }
  if (message.fromDevice.trustFingerprint !== expectedPeer.trustFingerprint) {
    throw new Error('server fingerprint mismatch');
  }
  if (
    typeof expectedPeer.trustPublicKey === 'string' &&
    expectedPeer.trustPublicKey.length > 0 &&
    message.fromDevice.trustPublicKey !== expectedPeer.trustPublicKey
  ) {
    throw new Error('server public key mismatch');
  }
  if (
    !verifyHandshakePayload(
      serverHelloPayload({
        type: message.type,
        version: message.version,
        clientEphemeralPublicKey: message.clientEphemeralPublicKey,
        clientNonce: message.clientNonce,
        serverEphemeralPublicKey: message.serverEphemeralPublicKey,
        serverNonce: message.serverNonce,
        fromDevice: message.fromDevice
      }),
      message.fromDevice.trustPublicKey,
      message.signature
    )
  ) {
    throw new Error('server hello signature mismatch');
  }
  if (
    message.clientEphemeralPublicKey !== clientHello.clientEphemeralPublicKey ||
    message.clientNonce !== clientHello.clientNonce
  ) {
    throw new Error('server hello does not match client handshake');
  }
}

function verifySignedIdentity(publicKey: string, fingerprint: string, signature: string): void {
  if (signature.length === 0) {
    throw new Error('missing secure handshake signature');
  }
  if (fingerprintForPublicKey(publicKey) !== fingerprint) {
    throw new Error('handshake fingerprint mismatch');
  }
}

function deriveSessionKeys(options: {
  role: 'client' | 'server';
  privateKey: KeyObject;
  remoteEphemeralPublicKey: string;
  clientHello: UnsignedClientHello;
  serverHello: UnsignedServerHello;
}): SessionKeys {
  const sharedSecret = diffieHellman({
    privateKey: options.privateKey,
    publicKey: createPublicKey({
      key: Buffer.from(options.remoteEphemeralPublicKey, 'base64'),
      format: 'der',
      type: 'spki'
    })
  });
  const transcript = createHash('sha256')
    .update(clientHelloPayload(options.clientHello), 'utf8')
    .update(serverHelloPayload(options.serverHello), 'utf8')
    .digest();
  const clientKey = Buffer.from(hkdfSync('sha256', sharedSecret, transcript, 'syncfile-client-key', 32));
  const serverKey = Buffer.from(hkdfSync('sha256', sharedSecret, transcript, 'syncfile-server-key', 32));
  const clientNoncePrefix = Buffer.from(hkdfSync('sha256', sharedSecret, transcript, 'syncfile-client-nonce', 4));
  const serverNoncePrefix = Buffer.from(hkdfSync('sha256', sharedSecret, transcript, 'syncfile-server-nonce', 4));

  if (options.role === 'client') {
    return {
      sendKey: clientKey,
      receiveKey: serverKey,
      sendNoncePrefix: clientNoncePrefix,
      receiveNoncePrefix: serverNoncePrefix
    };
  }

  return {
    sendKey: serverKey,
    receiveKey: clientKey,
    sendNoncePrefix: serverNoncePrefix,
    receiveNoncePrefix: clientNoncePrefix
  };
}

function exportPublicKey(
  key: KeyObject
): string {
  return key.export({ type: 'spki', format: 'der' }).toString('base64');
}

function signHandshakePayload(payload: string, privateKey: string): string {
  const key = createPrivateKey({
    key: Buffer.from(privateKey, 'base64'),
    format: 'der',
    type: 'pkcs8'
  });
  return sign(null, Buffer.from(payload, 'utf8'), key).toString('base64');
}

function verifyHandshakePayload(payload: string, publicKey: string, signature: string): boolean {
  const key = createPublicKey({
    key: Buffer.from(publicKey, 'base64'),
    format: 'der',
    type: 'spki'
  });
  return verify(null, Buffer.from(payload, 'utf8'), key, Buffer.from(signature, 'base64'));
}

function clientHelloPayload(message: UnsignedClientHello): string {
  return JSON.stringify({
    version: message.version,
    clientEphemeralPublicKey: message.clientEphemeralPublicKey,
    clientNonce: message.clientNonce,
    fromDevice: message.fromDevice
  });
}

function serverHelloPayload(message: UnsignedServerHello): string {
  return JSON.stringify({
    version: message.version,
    clientEphemeralPublicKey: message.clientEphemeralPublicKey,
    clientNonce: message.clientNonce,
    serverEphemeralPublicKey: message.serverEphemeralPublicKey,
    serverNonce: message.serverNonce,
    fromDevice: message.fromDevice
  });
}

function nonceForCounter(prefix: Buffer, counter: bigint): Buffer {
  const nonce = Buffer.allocUnsafe(12);
  prefix.copy(nonce, 0);
  nonce.writeBigUInt64BE(counter, 4);
  return nonce;
}

function isClientHello(message: HandshakeMessage): message is ClientHello {
  return (
    typeof message === 'object' &&
    message !== null &&
    message.type === 'secure-client-hello' &&
    typeof message.signature === 'string'
  );
}

function isServerHello(message: HandshakeMessage): message is ServerHello {
  return (
    typeof message === 'object' &&
    message !== null &&
    message.type === 'secure-server-hello' &&
    typeof message.signature === 'string'
  );
}

function asBuffer(data: string | Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}
