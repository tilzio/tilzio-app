// Console grid: dimension clamping and building the exact grid tree. Pure module
// (no Svelte) — unit-tested like state/ratio.ts.
import { type Leaf, type PaneNode, newSplit } from './types';

export const GRID_MAX_CELLS = 12; // ceiling on the number of WebGL contexts
export const GRID_MAX_DIM = 6;    // ceiling on a single dimension

function clampDim(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(GRID_MAX_DIM, Math.floor(n)));
}

// Clamp (cols, rows): each to [1, GRID_MAX_DIM], then rows ≤ ⌊MAX_CELLS/cols⌋,
// so the product does not exceed GRID_MAX_CELLS.
export function clampGrid(cols: number, rows: number): { cols: number; rows: number } {
  const c = clampDim(cols);
  const r = Math.min(clampDim(rows), Math.floor(GRID_MAX_CELLS / c));
  return { cols: c, rows: r };
}

// Build the grid tree from READY leaves: rows rows (outer split 'h'), each with
// up to cols consoles (split 'v'). A partial last row is allowed (leaves.length ≤
// cols*rows) — slice does not pad it. A singleton is not wrapped. Ratios are equal (newSplit
// without ratio).
export function buildGrid(leaves: Leaf[], cols: number, rows: number): PaneNode {
  const rowNodes: PaneNode[] = [];
  for (let r = 0; r < rows; r++) {
    const rowLeaves = leaves.slice(r * cols, r * cols + cols);
    rowNodes.push(rowLeaves.length === 1 ? rowLeaves[0] : newSplit('v', rowLeaves));
  }
  return rowNodes.length === 1 ? rowNodes[0] : newSplit('h', rowNodes);
}

// Auto dimensions of a balanced grid for n leaves (n ≥ 1): cols = ⌈√n⌉,
// rows = ⌈n/cols⌉. WITHOUT GRID_MAX_CELLS clamping — the leaves already exist (re-tile, not
// creating new sessions), the WebGL-context ceiling does not apply here.
export function autoGridDims(n: number): { cols: number; rows: number } {
  const count = Math.max(1, Math.floor(n));
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}
