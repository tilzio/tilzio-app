import { describe, it, expect } from 'vitest';
import { errorMessage } from './wailsError';

describe('errorMessage', () => {
  it('extracts the human message from a Wails v3 Call rejection blob', () => {
    const e = new Error('{"message":"plugins: download failed: boom","cause":{},"kind":"RuntimeError"}');
    expect(errorMessage(e)).toBe('plugins: download failed: boom');
  });

  it('returns the message of a plain Error', () => {
    const e = new Error('something went wrong');
    expect(errorMessage(e)).toBe('something went wrong');
  });

  it('stringifies a non-Error value', () => {
    expect(errorMessage('just a string')).toBe('just a string');
    expect(errorMessage(42)).toBe('42');
  });

  it('falls back to the raw text when JSON has no message field', () => {
    const e = new Error('{"cause":{},"kind":"RuntimeError"}');
    expect(errorMessage(e)).toBe('{"cause":{},"kind":"RuntimeError"}');
  });

  it('falls back to the raw text on invalid JSON', () => {
    const e = new Error('not json at all');
    expect(errorMessage(e)).toBe('not json at all');
  });
});
