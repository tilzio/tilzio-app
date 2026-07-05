import { describe, it, expect, beforeEach } from 'vitest';
import { pendingGoto, __resetForTests } from './pendingGoto.svelte';

beforeEach(() => __resetForTests());

describe('pendingGoto', () => {
  it('stores and returns a target by fileId', () => {
    pendingGoto.set('f1', { line: 42, col: 7 });
    expect(pendingGoto.get('f1')).toEqual({ line: 42, col: 7 });
  });
  it('returns undefined for an unknown fileId', () => {
    expect(pendingGoto.get('nope')).toBeUndefined();
  });
  it('consume removes the target (idempotent apply)', () => {
    pendingGoto.set('f1', { line: 5 });
    pendingGoto.consume('f1');
    expect(pendingGoto.get('f1')).toBeUndefined();
    expect(() => pendingGoto.consume('f1')).not.toThrow();
  });
});
