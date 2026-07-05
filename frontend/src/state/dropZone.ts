import type { PaneId, SplitId } from './types';

// Pane wall / layout side. left/right → vertical split (side by side,
// dir 'v'); top/bottom → horizontal (stacked, dir 'h'). The names describe WHERE
// the dragged pane lands relative to the target.
export type Side = 'left' | 'right' | 'top' | 'bottom';

// Where the dragged pane will land. Consumed by the movePane reducer.
export type DropTarget =
  | { kind: 'edge'; leafId: PaneId; side: Side }
  | { kind: 'swap'; leafId: PaneId }
  | { kind: 'divider'; splitId: SplitId; index: number }
  | { kind: 'outer'; side: Side };

// Fraction of the pane (centered) for the swap zone. The outer ring is split by diagonals into 4
// walls.
export const CENTER_FRAC = 0.5;

// Classify a drop point inside the pane by local coordinates. The central
// CENTER_FRAC×CENTER_FRAC rectangle → 'center' (swap). Otherwise — the nearest wall
// (minimum normalized distance; in normalized coordinates this is exactly
// the rectangle's diagonal division). Pure function, no DOM.
export function paneDropSide(
  localX: number,
  localY: number,
  w: number,
  h: number,
): Side | 'center' {
  if (w <= 0 || h <= 0) return 'center'; // degenerate/unmeasured → safe swap
  const fx = localX / w; // 0..1
  const fy = localY / h;
  const centerHalf = CENTER_FRAC / 2; // = 0.25 — the central zone extends ±centerHalf around 0.5
  if (Math.abs(fx - 0.5) <= centerHalf && Math.abs(fy - 0.5) <= centerHalf) return 'center';
  const dLeft = fx;
  const dRight = 1 - fx;
  const dTop = fy;
  const dBottom = 1 - fy;
  const min = Math.min(dLeft, dRight, dTop, dBottom);
  if (min === dLeft) return 'left';
  if (min === dRight) return 'right';
  if (min === dTop) return 'top';
  return 'bottom';
}
