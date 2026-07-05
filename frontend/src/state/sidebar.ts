// Left panel (sidebar navigator): UI helpers for width and reading ui state.
// Pure module (no Svelte) — unit-tested like state/ratio.ts.
import type { AppState, UiState } from './types';
import { DEFAULT_ALERT_COLOR } from './alertColors';
import { ACTIVE_DEFAULT, EXIT_DEFAULT, FONT_DEFAULT, FONT_SIZE_DEFAULT } from './appearance';
import { BOTTOM_PANEL_DEFAULT } from './bottomPanel';
import { RIGHT_AREA_DEFAULT } from './rightArea';

export const SIDEBAR_MIN = 160;
export const SIDEBAR_MAX = 480;
export const SIDEBAR_DEFAULT = 240;

// Width of the vertical Activity Bar (left grid column). Single source for the
// .layout grid template and the SidebarResizer offset math.
export const ACTIVITY_BAR_WIDTH = 44;

// Clamp the desired width (px) to [MIN, MAX]; NaN → default.
export function clampSidebarWidth(px: number): number {
  if (Number.isNaN(px)) return SIDEBAR_DEFAULT;
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, px));
}

// Read the ui state with defaults when a field is missing (old layout.json).
export function readUi(s: AppState): UiState {
  const ui = s.ui;
  return {
    sidebarCollapsed: ui?.sidebarCollapsed ?? false,
    sidebarWidth: ui?.sidebarWidth ?? SIDEBAR_DEFAULT,
    alertColor: ui?.alertColor ?? DEFAULT_ALERT_COLOR,
    activeColor: ui?.activeColor ?? ACTIVE_DEFAULT,
    exitColor: ui?.exitColor ?? EXIT_DEFAULT,
    uiFont: ui?.uiFont ?? FONT_DEFAULT,
    uiFontSize: ui?.uiFontSize ?? FONT_SIZE_DEFAULT,
    termFontSize: ui?.termFontSize ?? FONT_SIZE_DEFAULT,
    editorFontSize: ui?.editorFontSize ?? FONT_SIZE_DEFAULT,
    bottomPanelOpen: ui?.bottomPanelOpen ?? false,
    bottomPanelHeight: ui?.bottomPanelHeight ?? BOTTOM_PANEL_DEFAULT,
    rightAreaOpen: ui?.rightAreaOpen ?? false,
    rightAreaWidth: ui?.rightAreaWidth ?? RIGHT_AREA_DEFAULT,
  };
}
