import { describe, expect, it } from 'vitest';

import { MessageDecoder, encodeMessage } from './codec';
import { PROTOCOL_VERSION } from './protocol';

describe('encodeMessage', () => {
  it('prefixes payload with 4-byte big-endian utf8 byte length', () => {
    const message = { type: 'file-accept', fileId: 'abc' } as const;
    const encoded = encodeMessage(message);

    const length = encoded.readUInt32BE(0);
    const payload = encoded.subarray(4);

    expect(length).toBe(Buffer.byteLength(JSON.stringify(message), 'utf8'));
    expect(length).toBe(payload.length);
    expect(JSON.parse(payload.toString('utf8'))).toEqual(message);
  });

  it('uses utf8 byte length (not string length) for unicode payload', () => {
    const message = {
      type: 'file-offer',
      version: PROTOCOL_VERSION,
      fileId: 'id-unicode',
      fileName: '报告📄.pdf',
      fileSize: 10,
      fromDevice: { deviceId: 'd-1', name: '测试设备' }
    } as const;

    const encoded = encodeMessage(message);
    const declaredLength = encoded.readUInt32BE(0);
    const payloadText = encoded.subarray(4).toString('utf8');
    const payloadBytes = Buffer.byteLength(payloadText, 'utf8');

    expect(declaredLength).toBe(payloadBytes);
    expect(declaredLength).toBeGreaterThan(payloadText.length);
    expect(JSON.parse(payloadText)).toEqual(message);
  });
});

describe('MessageDecoder', () => {
  it('decodes a single complete message', () => {
    const decoder = new MessageDecoder();
    const encoded = encodeMessage({ type: 'file-accept', fileId: 'single' });

    const messages = decoder.push(encoded);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ type: 'file-accept', fileId: 'single' });
  });

  it('decodes one message split across multiple chunks and utf8 boundaries', () => {
    const decoder = new MessageDecoder();
    const encoded = encodeMessage({
      type: 'file-offer',
      version: PROTOCOL_VERSION,
      fileId: 'split',
      fileName: '报告.pdf',
      fileSize: 123,
      fromDevice: { deviceId: 'dev-a', name: '设备A' }
    });

    const c1 = encoded.subarray(0, 2);
    const c2 = encoded.subarray(2, 7);
    const c3 = encoded.subarray(7, 19);
    const c4 = encoded.subarray(19);

    expect(decoder.push(c1)).toHaveLength(0);
    expect(decoder.push(c2)).toHaveLength(0);
    expect(decoder.push(c3)).toHaveLength(0);

    const messages = decoder.push(c4);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      type: 'file-offer',
      version: PROTOCOL_VERSION,
      fileId: 'split',
      fileName: '报告.pdf',
      fileSize: 123,
      fromDevice: { deviceId: 'dev-a', name: '设备A' }
    });
  });

  it('decodes multiple messages in a single chunk', () => {
    const decoder = new MessageDecoder();
    const a = encodeMessage({ type: 'file-accept', fileId: 'a' });
    const b = encodeMessage({ type: 'file-accept', fileId: 'b' });
    const combined = Buffer.concat([a, b]);

    const messages = decoder.push(combined);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ type: 'file-accept', fileId: 'a' });
    expect(messages[1]).toEqual({ type: 'file-accept', fileId: 'b' });
  });

  it('returns trailing raw bytes as remainder', () => {
    const decoder = new MessageDecoder();
    const message = encodeMessage({ type: 'file-accept', fileId: 'x' });
    const trailing = Buffer.from([1, 2, 3, 4, 5]);
    const input = Buffer.concat([message, trailing]);

    const { messages, remainder } = decoder.pushWithRemainder(input);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ type: 'file-accept', fileId: 'x' });
    expect(remainder).toEqual(trailing);
  });

  it('preserves incomplete frames across pushWithRemainder calls', () => {
    const decoder = new MessageDecoder();
    const message = encodeMessage({ type: 'file-accept', fileId: 'split-remainder' });
    const trailing = Buffer.from([9, 8, 7]);

    const first = decoder.pushWithRemainder(message.subarray(0, 5));
    const second = decoder.pushWithRemainder(Buffer.concat([message.subarray(5), trailing]));

    expect(first.messages).toHaveLength(0);
    expect(first.remainder).toHaveLength(0);
    expect(second.messages).toHaveLength(1);
    expect(second.messages[0]).toEqual({ type: 'file-accept', fileId: 'split-remainder' });
    expect(second.remainder).toEqual(trailing);
  });
});
