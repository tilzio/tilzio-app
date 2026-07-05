import type { PaneId, PaneNode } from './types';
import { isLeaf } from './types';

// Direction of pane navigation (⌘⌥-arrows). Defined here because focusNeighbor's
// geometry is its origin; reducers, keymap and the store import Dir from here.
export type Dir = 'left' | 'right' | 'up' | 'down';

// Minimum pane size along the split axis (px). Below this the pane bottoms out and the split
// scrolls (CSS .cell min-width/height in SplitContainer kept in sync). The threshold
// for hiding the split buttons = 2×MIN_PANE_PX (below it a split would produce sub-minimum children).
export const MIN_PANE_PX = 160;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Assign every leaf a normalized rectangle in [0,1]² by recursively subdividing
// the parent rect along the split axis in proportion to `ratio` (design §12.2).
// 'v' splits (side-by-side) divide width (X); 'h' splits (stacked) divide height
// (Y) — matching SplitContainer's flex-direction.
export function leafRects(
  node: PaneNode,
  rect: Rect = { x: 0, y: 0, w: 1, h: 1 },
): Map<PaneId, Rect> {
  const out = new Map<PaneId, Rect>();
  if (isLeaf(node)) {
    out.set(node.id, rect);
    return out;
  }
  const total = node.ratio.reduce((a, b) => a + b, 0) || 1;
  let offset = 0;
  node.children.forEach((child, i) => {
    const frac = node.ratio[i] / total;
    const childRect: Rect =
      node.dir === 'v'
        ? { x: rect.x + offset * rect.w, y: rect.y, w: frac * rect.w, h: rect.h }
        : { x: rect.x, y: rect.y + offset * rect.h, w: rect.w, h: frac * rect.h };
    for (const [id, r] of leafRects(child, childRect)) out.set(id, r);
    offset += frac;
  });
  return out;
}

function center(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

// Two 1-D ranges overlap if they share more than a touching edge.
function overlaps(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2;
}

// Pick the visual neighbor of `activeId` in direction `dir`: among leaves whose
// center is in the half-plane of `dir` AND which overlap on the perpendicular
// axis, choose the nearest by distance along the arrow axis (tie-break: smaller
// perpendicular center offset). Returns null at an edge (design §12.2).
export function neighbor(rects: Map<PaneId, Rect>, activeId: PaneId, dir: Dir): PaneId | null {
  const R = rects.get(activeId);
  if (!R) return null;
  const rc = center(R);
  let best: { id: PaneId; primary: number; perp: number } | null = null;
  for (const [id, r] of rects) {
    if (id === activeId) continue;
    const c = center(r);
    let inDir = false;
    let overlap = false;
    let primary = 0;
    let perp = 0;
    if (dir === 'left') {
      inDir = c.x < rc.x;
      overlap = overlaps(r.y, r.y + r.h, R.y, R.y + R.h);
      primary = rc.x - c.x;
      perp = Math.abs(c.y - rc.y);
    } else if (dir === 'right') {
      inDir = c.x > rc.x;
      overlap = overlaps(r.y, r.y + r.h, R.y, R.y + R.h);
      primary = c.x - rc.x;
      perp = Math.abs(c.y - rc.y);
    } else if (dir === 'up') {
      inDir = c.y < rc.y;
      overlap = overlaps(r.x, r.x + r.w, R.x, R.x + R.w);
      primary = rc.y - c.y;
      perp = Math.abs(c.x - rc.x);
    } else {
      inDir = c.y > rc.y;
      overlap = overlaps(r.x, r.x + r.w, R.x, R.x + R.w);
      primary = c.y - rc.y;
      perp = Math.abs(c.x - rc.x);
    }
    if (!inDir || !overlap) continue;
    // Exact equality is intentional: sibling panes at the same split level produce
    // exactly equal primary distances in symmetric grids, where the perp tie-break decides.
    if (best === null || primary < best.primary || (primary === best.primary && perp < best.perp)) {
      best = { id, primary, perp };
    }
  }
  return best ? best.id : null;
}
