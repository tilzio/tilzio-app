import { describe, it, expect } from 'vitest';
import { clampRightAreaWidth, RIGHT_AREA_MIN, RIGHT_AREA_MAX, RIGHT_AREA_DEFAULT } from './rightArea';

describe('clampRightAreaWidth', () => {
  it('a value inside the range as is', () => {
    expect(clampRightAreaWidth(300)).toBe(300);
  });
  it('below the minimum → MIN', () => {
    expect(clampRightAreaWidth(10)).toBe(RIGHT_AREA_MIN);
  });
  it('above the maximum → MAX', () => {
    expect(clampRightAreaWidth(9999)).toBe(RIGHT_AREA_MAX);
  });
  it('NaN → default', () => {
    expect(clampRightAreaWidth(NaN)).toBe(RIGHT_AREA_DEFAULT);
  });
});

describe('right column constants', () => {
  it('DEFAULT inside [MIN, MAX]', () => {
    expect(RIGHT_AREA_DEFAULT).toBeGreaterThanOrEqual(RIGHT_AREA_MIN);
    expect(RIGHT_AREA_DEFAULT).toBeLessThanOrEqual(RIGHT_AREA_MAX);
  });
  // S2.1: check the new numeric default value
  it('default = 300', () => expect(RIGHT_AREA_DEFAULT).toBe(300));
  it('NaN → 300', () => expect(clampRightAreaWidth(NaN)).toBe(300));
});
