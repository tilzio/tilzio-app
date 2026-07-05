import { describe, it, expect } from 'vitest';
import { clampGrid, buildGrid, autoGridDims, GRID_MAX_CELLS, GRID_MAX_DIM } from './grid';
import { newLeaf, type Split } from './types';

describe('autoGridDims', () => {
  it('balanced grid for N leaves', () => {
    expect(autoGridDims(1)).toEqual({ cols: 1, rows: 1 });
    expect(autoGridDims(2)).toEqual({ cols: 2, rows: 1 }); // side by side
    expect(autoGridDims(4)).toEqual({ cols: 2, rows: 2 });
    expect(autoGridDims(5)).toEqual({ cols: 3, rows: 2 });
    expect(autoGridDims(9)).toEqual({ cols: 3, rows: 3 });
  });
  it('cols*rows ≥ n and no extra empty rows ((rows-1)*cols < n)', () => {
    for (let n = 1; n <= 20; n++) {
      const { cols, rows } = autoGridDims(n);
      expect(cols * rows).toBeGreaterThanOrEqual(n);
      expect((rows - 1) * cols).toBeLessThan(n);
    }
  });
});

describe('clampGrid', () => {
  it('values within range unchanged', () => {
    expect(clampGrid(2, 2)).toEqual({ cols: 2, rows: 2 });
    expect(clampGrid(3, 3)).toEqual({ cols: 3, rows: 3 });
  });
  it('each dimension is clamped to GRID_MAX_DIM', () => {
    expect(clampGrid(9, 1)).toEqual({ cols: GRID_MAX_DIM, rows: 1 });
  });
  it('shrinks rows so the product ≤ GRID_MAX_CELLS', () => {
    expect(clampGrid(6, 6)).toEqual({ cols: 6, rows: 2 });
    expect(clampGrid(4, 4)).toEqual({ cols: 4, rows: 3 });
    expect(clampGrid(5, 5)).toEqual({ cols: 5, rows: 2 });
  });
  it('fractional rounds down, zero/NaN → 1', () => {
    expect(clampGrid(2.9, 2.1)).toEqual({ cols: 2, rows: 2 });
    expect(clampGrid(0, 0)).toEqual({ cols: 1, rows: 1 });
    expect(clampGrid(NaN, NaN)).toEqual({ cols: 1, rows: 1 });
  });
  it('the product never exceeds GRID_MAX_CELLS', () => {
    for (let c = 1; c <= 8; c++)
      for (let r = 1; r <= 8; r++) {
        const g = clampGrid(c, r);
        expect(g.cols * g.rows).toBeLessThanOrEqual(GRID_MAX_CELLS);
      }
  });
});

describe('buildGrid', () => {
  const leaves = (n: number) => Array.from({ length: n }, () => newLeaf());
  it('2×2 → split h of two split v', () => {
    const ls = leaves(4);
    const root = buildGrid(ls, 2, 2) as Split;
    expect(root.kind).toBe('split');
    expect(root.dir).toBe('h');
    expect(root.children).toHaveLength(2);
    expect((root.children[0] as Split).dir).toBe('v');
    expect((root.children[0] as Split).children).toHaveLength(2);
  });
  it('1×1 → single leaf (no wrapper)', () => {
    const ls = leaves(1);
    expect(buildGrid(ls, 1, 1)).toBe(ls[0]);
  });
  it('3×1 → one row split v of three', () => {
    const root = buildGrid(leaves(3), 3, 1) as Split;
    expect(root.dir).toBe('v');
    expect(root.children).toHaveLength(3);
  });
  it('1×3 → stack split h of three leaves', () => {
    const root = buildGrid(leaves(3), 1, 3) as Split;
    expect(root.dir).toBe('h');
    expect(root.children).toHaveLength(3);
    expect(root.children.every((c) => c.kind === 'terminal')).toBe(true);
  });
  it('preserves the passed leaves by reference (order)', () => {
    const ls = leaves(4);
    const root = buildGrid(ls, 2, 2) as Split;
    const flat = (root.children as Split[]).flatMap((row) => row.children);
    expect(flat).toEqual(ls);
  });
  it('equal ratios on each split', () => {
    const root = buildGrid(leaves(4), 2, 2) as Split;
    expect(root.ratio).toEqual([0.5, 0.5]);
    expect((root.children[0] as Split).ratio).toEqual([0.5, 0.5]);
  });
});
