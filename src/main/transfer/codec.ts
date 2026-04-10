import type { ProtocolMessage } from './protocol';

const HEADER_BYTES = 4;
const UINT32_MAX = 0xffffffff;

function asBuffer(chunk: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
}

function isProtocolMessageLike(value: unknown): value is ProtocolMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

export function encodeMessage(msg: ProtocolMessage): Buffer {
  const payload = Buffer.from(JSON.stringify(msg), 'utf8');
  if (payload.length > UINT32_MAX) {
    throw new RangeError(`Message exceeds ${UINT32_MAX} bytes`);
  }

  const header = Buffer.allocUnsafe(HEADER_BYTES);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

export class MessageDecoder {
  private buffer: Buffer = Buffer.alloc(0);

  push(chunk: Buffer | Uint8Array): ProtocolMessage[] {
    this.buffer = Buffer.concat([this.buffer, asBuffer(chunk)]);
    const { messages } = this.drainMessages({ allowInvalidTrailingData: false });
    return messages;
  }

  pushWithRemainder(
    chunk: Buffer | Uint8Array
  ): { messages: ProtocolMessage[]; remainder: Buffer } {
    this.buffer = Buffer.concat([this.buffer, asBuffer(chunk)]);
    const { messages, remainder } = this.drainMessages({ allowInvalidTrailingData: true });
    return { messages, remainder };
  }

  private drainMessages(options: {
    allowInvalidTrailingData: boolean;
  }): { messages: ProtocolMessage[]; remainder: Buffer } {
    let offset = 0;
    const messages: ProtocolMessage[] = [];
    let trailingRemainder = false;

    while (this.buffer.length - offset >= HEADER_BYTES) {
      const bodyLength = this.buffer.readUInt32BE(offset);
      const frameLength = HEADER_BYTES + bodyLength;
      if (this.buffer.length - offset < frameLength) {
        trailingRemainder = options.allowInvalidTrailingData && messages.length > 0;
        break;
      }

      const bodyStart = offset + HEADER_BYTES;
      const bodyEnd = bodyStart + bodyLength;
      const body = this.buffer.subarray(bodyStart, bodyEnd);

      let parsed: unknown;
      try {
        parsed = JSON.parse(body.toString('utf8'));
      } catch (error) {
        if (options.allowInvalidTrailingData && messages.length > 0) {
          trailingRemainder = true;
          break;
        }
        throw error;
      }

      if (!isProtocolMessageLike(parsed)) {
        if (options.allowInvalidTrailingData && messages.length > 0) {
          trailingRemainder = true;
          break;
        }
        throw new Error('Invalid protocol message');
      }

      messages.push(parsed);
      offset = bodyEnd;
    }

    const remainder = this.buffer.subarray(offset);
    if (!options.allowInvalidTrailingData) {
      this.buffer = remainder;
      return { messages, remainder: Buffer.alloc(0) };
    }

    if (trailingRemainder || (messages.length > 0 && remainder.length > 0)) {
      this.buffer = Buffer.alloc(0);
      return { messages, remainder };
    }

    this.buffer = remainder;
    return { messages, remainder: Buffer.alloc(0) };
  }
}
