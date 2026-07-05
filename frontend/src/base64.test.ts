import { describe, it, expect } from 'vitest';
import { base64ToBytes, bytesToBase64 } from './base64';

describe('base64ToBytes', () => {
  it('decodes ascii', () => {
    expect(Array.from(base64ToBytes(btoa('hello')))).toEqual([104, 101, 108, 108, 111]);
  });

  it('decodes raw bytes including high and control values', () => {
    const b64 = btoa(String.fromCharCode(0x00, 0xff, 0x1b, 0x5b)); // "\x00\xff\x1b["
    expect(Array.from(base64ToBytes(b64))).toEqual([0x00, 0xff, 0x1b, 0x5b]);
  });
});

describe('bytesToBase64', () => {
  it('matches a known vector', () => {
    expect(bytesToBase64(new Uint8Array([1, 2, 3]))).toBe('AQID');
  });

  it('round-trips through base64ToBytes (including 0/255/newline)', () => {
    const src = new Uint8Array([0, 1, 2, 254, 255, 13, 10, 65]);
    expect(base64ToBytes(bytesToBase64(src))).toEqual(src);
  });

  it('survives an array larger than one chunk (no stack overflow)', () => {
    const big = new Uint8Array(100_000);
    for (let i = 0; i < big.length; i++) big[i] = i % 256;
    expect(base64ToBytes(bytesToBase64(big))).toEqual(big);
  });
});
