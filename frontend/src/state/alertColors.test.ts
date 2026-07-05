import { describe, it, expect } from 'vitest';
import { alertColorHex, ALERT_COLORS, DEFAULT_ALERT_COLOR } from './alertColors';

describe('alertColorHex', () => {
  it('known key → its hex', () => {
    expect(alertColorHex('magenta')).toBe(ALERT_COLORS.magenta);
  });
  it('undefined → default (cyan #2bd9c4)', () => {
    expect(alertColorHex(undefined)).toBe(ALERT_COLORS[DEFAULT_ALERT_COLOR]);
    expect(alertColorHex(undefined)).toBe('#2bd9c4');
  });
  it('unknown key → default', () => {
    expect(alertColorHex('nope' as never)).toBe(ALERT_COLORS[DEFAULT_ALERT_COLOR]);
  });
});
