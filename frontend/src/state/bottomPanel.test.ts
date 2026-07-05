import { describe, it, expect } from 'vitest';
import {
  clampBottomPanelHeight,
  BOTTOM_PANEL_MIN, BOTTOM_PANEL_MAX, BOTTOM_PANEL_DEFAULT, STATUS_BAR_HEIGHT,
} from './bottomPanel';

describe('clampBottomPanelHeight', () => {
  it('value within range stays as-is', () => {
    expect(clampBottomPanelHeight(300)).toBe(300);
  });
  it('below minimum → MIN', () => {
    expect(clampBottomPanelHeight(10)).toBe(BOTTOM_PANEL_MIN);
  });
  it('above maximum → MAX', () => {
    expect(clampBottomPanelHeight(9999)).toBe(BOTTOM_PANEL_MAX);
  });
  it('NaN → default', () => {
    expect(clampBottomPanelHeight(NaN)).toBe(BOTTOM_PANEL_DEFAULT);
  });
});

describe('bottom panel constants', () => {
  it('STATUS_BAR_HEIGHT is positive', () => {
    expect(STATUS_BAR_HEIGHT).toBeGreaterThan(0);
  });
  it('DEFAULT within [MIN, MAX]', () => {
    expect(BOTTOM_PANEL_DEFAULT).toBeGreaterThanOrEqual(BOTTOM_PANEL_MIN);
    expect(BOTTOM_PANEL_DEFAULT).toBeLessThanOrEqual(BOTTOM_PANEL_MAX);
  });
  // S2.1: exact numeric default values
  it('STATUS_BAR_HEIGHT === 24', () => expect(STATUS_BAR_HEIGHT).toBe(24));
  it('BOTTOM_PANEL_DEFAULT has not drifted === 200', () => expect(BOTTOM_PANEL_DEFAULT).toBe(200));
  it('clampBottomPanelHeight(NaN) === 200', () => expect(clampBottomPanelHeight(NaN)).toBe(200));
});

describe('STATUS_BAR_HEIGHT', () => {
  it('= 24 (new design)', () => { expect(STATUS_BAR_HEIGHT).toBe(24); });
});
