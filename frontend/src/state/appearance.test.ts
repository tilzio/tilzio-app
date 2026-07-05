import { describe, it, expect } from 'vitest';
import {
  COLOR_PRESETS, resolveColor, fontStack, clampFontSize,
  FONT_SIZE_MIN, FONT_SIZE_MAX, FONT_SIZE_DEFAULT,
  FONT_PRESETS, FONT_DEFAULT,
} from './appearance';
import { ALERT_COLORS } from './alertColors';

describe('resolveColor', () => {
  it('preset name → hex', () => {
    expect(resolveColor('orange', '#000000')).toBe('#fe8019');
    expect(resolveColor('cyan', '#000000')).toBe(COLOR_PRESETS.cyan);
  });
  it('valid hex → as is', () => {
    expect(resolveColor('#abcdef', '#000000')).toBe('#abcdef');
    expect(resolveColor('#ABCDEF', '#000000')).toBe('#ABCDEF');
  });
  it('invalid hex → fallback', () => {
    expect(resolveColor('#xyz', '#000000')).toBe('#000000');
    expect(resolveColor('#1234', '#000000')).toBe('#000000');
  });
  it('unknown name → fallback', () => {
    expect(resolveColor('nope', '#000000')).toBe('#000000');
  });
  it('undefined → fallback', () => {
    expect(resolveColor(undefined, '#123456')).toBe('#123456');
  });
  it('aqua preset → #83a598 (new info color)', () => {
    expect(resolveColor('aqua', '#000000')).toBe('#83a598');
    expect(COLOR_PRESETS.aqua).toBe('#83a598');
  });
  it('aqua is not in ALERT_COLORS (outside the alert set)', () => {
    expect('aqua' in ALERT_COLORS).toBe(false);
  });
});

describe('fontStack', () => {
  it('known key → stack', () => {
    expect(fontStack('serif')).toContain('Georgia');
  });
  it('unknown/undefined → mono stack', () => {
    expect(fontStack(undefined)).toContain('monospace');
    expect(fontStack('nope' as never)).toContain('monospace');
  });
  it('jetbrains key → stack with JetBrains Mono', () => {
    expect(fontStack('jetbrains')).toContain('JetBrains Mono');
  });
});

describe('FONT_PRESETS / FONT_DEFAULT (M4.1 JetBrains Mono)', () => {
  it('has a jetbrains preset with correct label/stack', () => {
    const jb = FONT_PRESETS.find((f) => f.key === 'jetbrains');
    expect(jb).toBeDefined();
    expect(jb!.label).toBe('JetBrains Mono');
    expect(jb!.stack).toContain("'JetBrains Mono'");
    expect(jb!.stack).toContain('ui-monospace');
  });
  it('jetbrains comes first after mono', () => {
    const keys = FONT_PRESETS.map((f) => f.key);
    expect(keys[0]).toBe('mono');
    expect(keys[1]).toBe('jetbrains');
  });
  it('FONT_DEFAULT === jetbrains', () => {
    expect(FONT_DEFAULT).toBe('jetbrains');
  });
});

describe('clampFontSize', () => {
  it('within range → as is (rounded)', () => {
    expect(clampFontSize(13)).toBe(13);
    expect(clampFontSize(13.4)).toBe(13);
  });
  it('below minimum → MIN', () => {
    expect(clampFontSize(2)).toBe(FONT_SIZE_MIN);
  });
  it('above maximum → MAX', () => {
    expect(clampFontSize(99)).toBe(FONT_SIZE_MAX);
  });
  it('NaN/0/invalid → default', () => {
    expect(clampFontSize(NaN)).toBe(FONT_SIZE_DEFAULT);
    expect(clampFontSize(0)).toBe(FONT_SIZE_DEFAULT);
  });
  it('boundaries and negatives', () => {
    expect(clampFontSize(9)).toBe(9);
    expect(clampFontSize(8)).toBe(FONT_SIZE_MIN);
    expect(clampFontSize(24)).toBe(24);
    expect(clampFontSize(-1)).toBe(FONT_SIZE_DEFAULT);
    expect(clampFontSize(Infinity)).toBe(FONT_SIZE_DEFAULT);
  });
});
