import { describe, it, expect } from 'vitest';
import { allEqual, equalRatio } from './ratio';

describe('allEqual', () => {
  it('empty array and a single element → true', () => {
    expect(allEqual([])).toBe(true);
    expect(allEqual([1])).toBe(true);
  });
  it('equal shares → true', () => {
    expect(allEqual([0.5, 0.5])).toBe(true);
    expect(allEqual([1 / 3, 1 / 3, 1 / 3])).toBe(true);
    expect(allEqual(equalRatio(4))).toBe(true);
  });
  it('unequal shares → false', () => {
    expect(allEqual([0.25, 0.25, 0.5])).toBe(false);
    expect(allEqual([0.8, 0.2])).toBe(false);
  });
  it('nearly equal within tolerance → true', () => {
    expect(allEqual([0.5, 0.5 + 1e-9])).toBe(true);
  });
  it('tolerance is configurable', () => {
    expect(allEqual([0.5, 0.6], 0.2)).toBe(true);
    expect(allEqual([0.5, 0.6], 0.05)).toBe(false);
  });
});

describe('equalRatio', () => {
  it('returns N equal shares', () => {
    expect(equalRatio(2)).toEqual([0.5, 0.5]);
    expect(equalRatio(4)).toEqual([0.25, 0.25, 0.25, 0.25]);
  });
  it('length equals N and all elements are the same', () => {
    const r = equalRatio(3);
    expect(r).toHaveLength(3);
    expect(r[0]).toBe(r[1]);
    expect(r[1]).toBe(r[2]);
  });
});
