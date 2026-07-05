// Right area (③): width helpers. Pure module (mirror of state/bottomPanel.ts).
export const RIGHT_AREA_MIN = 160;
export const RIGHT_AREA_MAX = 600;
export const RIGHT_AREA_DEFAULT = 300;

// Clamp the desired width (px) to [MIN, MAX]; NaN → default.
export function clampRightAreaWidth(px: number): number {
  if (Number.isNaN(px)) return RIGHT_AREA_DEFAULT;
  return Math.min(RIGHT_AREA_MAX, Math.max(RIGHT_AREA_MIN, px));
}
