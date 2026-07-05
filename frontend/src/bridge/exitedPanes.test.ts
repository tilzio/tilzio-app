import { describe, it, expect, afterEach } from 'vitest';
import { exitedPanes, markExited, clearExited, isExited, __resetForTests } from './exitedPanes.svelte';
afterEach(__resetForTests);
describe('exitedPanes holder', () => {
  it('markExited records the code and marks exited', () => {
    markExited('a', 0);
    expect(isExited('a')).toBe(true);
    expect(exitedPanes.codes.a).toBe(0); // code 0 is a valid exit
  });
  it('stores a non-zero code', () => {
    markExited('a', 137);
    expect(exitedPanes.codes.a).toBe(137);
  });
  it('clearExited removes the key', () => {
    markExited('a', 0); clearExited('a');
    expect(isExited('a')).toBe(false);
    expect('a' in exitedPanes.codes).toBe(false);
  });
  it('clearExited without a record is safe', () => {
    expect(() => clearExited('nope')).not.toThrow();
  });
  it('__resetForTests clears everything', () => {
    markExited('a', 0); markExited('b', 1); __resetForTests();
    expect(Object.keys(exitedPanes.codes)).toHaveLength(0);
  });
});
