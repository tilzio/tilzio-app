import { describe, it, expect } from 'vitest';
import { clampSidebarWidth, SIDEBAR_MIN, SIDEBAR_MAX, SIDEBAR_DEFAULT, readUi } from './sidebar';
import { initialState } from './types';
import { DEFAULT_ALERT_COLOR } from './alertColors';
import { ACTIVE_DEFAULT, EXIT_DEFAULT, FONT_DEFAULT, FONT_SIZE_DEFAULT } from './appearance';
import { BOTTOM_PANEL_DEFAULT } from './bottomPanel';
import { RIGHT_AREA_DEFAULT } from './rightArea';

describe('clampSidebarWidth', () => {
  it('returns a value inside the range as is', () => {
    expect(clampSidebarWidth(300)).toBe(300);
  });
  it('a value below the minimum → MIN', () => {
    expect(clampSidebarWidth(50)).toBe(SIDEBAR_MIN);
  });
  it('a value above the maximum → MAX', () => {
    expect(clampSidebarWidth(9999)).toBe(SIDEBAR_MAX);
  });
  it('NaN → default', () => {
    expect(clampSidebarWidth(NaN)).toBe(SIDEBAR_DEFAULT);
  });
  // S2.1: check the new numeric default value
  it('default = 240', () => expect(SIDEBAR_DEFAULT).toBe(240));
  it('NaN → 240', () => expect(clampSidebarWidth(NaN)).toBe(240));
});

describe('readUi', () => {
  it('returns ui with appearance defaults when only partially present', () => {
    const s = initialState();
    s.ui = { sidebarCollapsed: true, sidebarWidth: 300 };
    expect(readUi(s)).toEqual({
      sidebarCollapsed: true, sidebarWidth: 300,
      alertColor: DEFAULT_ALERT_COLOR, activeColor: ACTIVE_DEFAULT, exitColor: EXIT_DEFAULT,
      uiFont: FONT_DEFAULT, uiFontSize: FONT_SIZE_DEFAULT,
      termFontSize: FONT_SIZE_DEFAULT, editorFontSize: FONT_SIZE_DEFAULT,
      bottomPanelOpen: false, bottomPanelHeight: BOTTOM_PANEL_DEFAULT,
      rightAreaOpen: false, rightAreaWidth: RIGHT_AREA_DEFAULT,
    });
  });
  it('returns all defaults when ui is absent', () => {
    const s = { ...initialState(), ui: undefined };
    expect(readUi(s)).toEqual({
      sidebarCollapsed: false, sidebarWidth: SIDEBAR_DEFAULT,
      alertColor: DEFAULT_ALERT_COLOR, activeColor: ACTIVE_DEFAULT, exitColor: EXIT_DEFAULT,
      uiFont: FONT_DEFAULT, uiFontSize: FONT_SIZE_DEFAULT,
      termFontSize: FONT_SIZE_DEFAULT, editorFontSize: FONT_SIZE_DEFAULT,
      bottomPanelOpen: false, bottomPanelHeight: BOTTOM_PANEL_DEFAULT,
      rightAreaOpen: false, rightAreaWidth: RIGHT_AREA_DEFAULT,
    });
  });
  it('preserves user appearance values', () => {
    const s = initialState();
    s.ui = { sidebarCollapsed: false, sidebarWidth: 220,
      activeColor: '#112233', exitColor: 'amber', uiFont: 'serif', uiFontSize: 18 };
    const u = readUi(s);
    expect(u.activeColor).toBe('#112233');
    expect(u.exitColor).toBe('amber');
    expect(u.uiFont).toBe('serif');
    expect(u.uiFontSize).toBe(18);
  });
  it('preserves the given bottom-panel values', () => {
    const s = initialState();
    s.ui = { sidebarCollapsed: false, sidebarWidth: 220, bottomPanelOpen: true, bottomPanelHeight: 320 };
    const u = readUi(s);
    expect(u.bottomPanelOpen).toBe(true);
    expect(u.bottomPanelHeight).toBe(320);
  });
  it('readUi provides right-column defaults for an old layout', () => {
    const ui = readUi({ activeSpaceId: 'x', spaces: [] } as never);
    expect(ui.rightAreaOpen).toBe(false);
    expect(ui.rightAreaWidth).toBe(RIGHT_AREA_DEFAULT);
  });
  // S2.1: empty ui → numeric defaults 240 / 300
  it('empty ui → sidebarWidth 240 / rightAreaWidth 300', () => {
    const u = readUi({ activeSpaceId: 'x', spaces: [] } as never);
    expect(u.sidebarWidth).toBe(240);
    expect(u.rightAreaWidth).toBe(300);
  });
});
