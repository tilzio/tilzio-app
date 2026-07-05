import { describe, it, expect } from 'vitest';
import { paneDropSide, CENTER_FRAC } from './dropZone';

describe('paneDropSide', () => {
  const W = 100, H = 100;

  it('center → swap zone', () => {
    expect(paneDropSide(50, 50, W, H)).toBe('center');
  });

  it('each wall by the nearest edge', () => {
    expect(paneDropSide(5, 50, W, H)).toBe('left');
    expect(paneDropSide(95, 50, W, H)).toBe('right');
    expect(paneDropSide(50, 5, W, H)).toBe('top');
    expect(paneDropSide(50, 95, W, H)).toBe('bottom');
  });

  it('diagonals decide the corner (top-left → one of the adjacent walls)', () => {
    expect(paneDropSide(10, 10, W, H)).toBe('left');
  });

  it('works by proportions, not absolutes (non-symmetric rectangle)', () => {
    expect(paneDropSide(10, 50, 200, 100)).toBe('left');
    expect(paneDropSide(190, 50, 200, 100)).toBe('right');
  });

  it('central zone bounds = CENTER_FRAC', () => {
    expect(CENTER_FRAC).toBe(0.5);
    expect(paneDropSide(30, 50, W, H)).toBe('center');
    expect(paneDropSide(70, 50, W, H)).toBe('center');
    expect(paneDropSide(25, 50, W, H)).toBe('center'); // exactly on the 0.25 boundary → inclusive
    expect(paneDropSide(20, 50, W, H)).toBe('left');
  });

  it('degenerate size (0×0, unmeasured) → safe center', () => {
    expect(paneDropSide(0, 0, 0, 0)).toBe('center');
  });
});
