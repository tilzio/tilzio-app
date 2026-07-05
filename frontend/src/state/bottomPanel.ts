// Bottom dock area (④): height helpers + status bar height. Pure module
// (no Svelte) — unit-tested like state/sidebar.ts.

export const BOTTOM_PANEL_MIN = 80;
export const BOTTOM_PANEL_MAX = 600;
export const BOTTOM_PANEL_DEFAULT = 200;

// Status bar height (bottom row of grid .layout). Single source for the grid
// template and the bottom-panel resize math (window bottom − this height = panel bottom).
export const STATUS_BAR_HEIGHT = 24;

// Clamp the desired height (px) to [MIN, MAX]; NaN → default.
export function clampBottomPanelHeight(px: number): number {
  if (Number.isNaN(px)) return BOTTOM_PANEL_DEFAULT;
  return Math.min(BOTTOM_PANEL_MAX, Math.max(BOTTOM_PANEL_MIN, px));
}
