import { describe, it, expect } from 'vitest';
import { sanitizeWidgets, toneColor, cleanHexColor, cleanTone } from './widgets';

describe('sanitizeWidgets', () => {
  it('non-object / no widgets → []', () => {
    expect(sanitizeWidgets(null)).toEqual([]);
    expect(sanitizeWidgets({})).toEqual([]);
    expect(sanitizeWidgets({ widgets: 'x' })).toEqual([]);
  });

  it('skips a widget with an unknown type', () => {
    const out = sanitizeWidgets({ widgets: [{ type: 'bogus' }, { type: 'text', text: 'ok' }] });
    expect(out).toEqual([{ type: 'text', text: 'ok', tone: 'default' }]);
  });

  it('text: coerces text to a string, label/tone optional', () => {
    const out = sanitizeWidgets({ widgets: [{ type: 'text', text: 42, label: 'L', tone: 'accent' }] });
    expect(out[0]).toEqual({ type: 'text', text: '42', label: 'L', tone: 'accent' });
  });

  it('text: unknown tone → default', () => {
    const out = sanitizeWidgets({ widgets: [{ type: 'text', text: 'a', tone: 'evil' }] });
    expect(out[0]).toEqual({ type: 'text', text: 'a', tone: 'default' });
  });

  it('badge/list/buttons/table are normalized', () => {
    const out = sanitizeWidgets({ widgets: [
      { type: 'badge', items: [{ text: 'x', tone: 'warn' }] },
      { type: 'list', items: [{ text: 'a', command: 'c1' }, { text: 'b' }] },
      { type: 'buttons', items: [{ text: 'go', command: 'c2' }, { text: 'no-cmd' }] },
      { type: 'table', columns: ['a', 'b'], rows: [['1', '2']] },
    ]});
    expect(out[0]).toEqual({ type: 'badge', items: [{ text: 'x', tone: 'warn' }] });
    expect(out[1]).toEqual({ type: 'list', items: [{ text: 'a', tone: 'default', command: 'c1' }, { text: 'b', tone: 'default' }] });
    expect(out[2]).toEqual({ type: 'buttons', items: [{ text: 'go', command: 'c2' }] });
    expect(out[3]).toEqual({ type: 'table', columns: ['a', 'b'], rows: [['1', '2']] });
  });

  it('chart with an unknown kind is discarded', () => {
    expect(sanitizeWidgets({ widgets: [{ type: 'chart', kind: 'pie' }] })).toEqual([]);
  });

  it('chart line/bar/ring: numbers are coerced, NaN→0', () => {
    const out = sanitizeWidgets({ widgets: [
      { type: 'chart', kind: 'line', values: [1, 'x', 3] },
      { type: 'chart', kind: 'bar', bars: [{ label: 'a', value: '5' }] },
      { type: 'chart', kind: 'ring', segments: [{ label: 's', value: 7 }], max: 10 },
    ]});
    expect(out[0]).toEqual({ type: 'chart', kind: 'line', values: [1, 0, 3] });
    expect(out[1]).toEqual({ type: 'chart', kind: 'bar', bars: [{ label: 'a', value: 5 }] });
    expect(out[2]).toEqual({ type: 'chart', kind: 'ring', segments: [{ label: 's', value: 7 }], max: 10 });
  });

  it('trims pathologically large arrays (guard against RangeError)', () => {
    const big = Array.from({ length: 100000 }, (_, i) => i);
    const out = sanitizeWidgets({ widgets: [{ type: 'chart', kind: 'line', values: big }] });
    expect((out[0] as { values: number[] }).values.length).toBeLessThanOrEqual(2000);
  });

  it('trims a huge list of widgets', () => {
    const many = Array.from({ length: 5000 }, () => ({ type: 'text', text: 'x' }));
    expect(sanitizeWidgets({ widgets: many }).length).toBeLessThanOrEqual(500);
  });

  it('chart bar: preserves the percent option', () => {
    const out = sanitizeWidgets({ widgets: [{ type: 'chart', kind: 'bar', bars: [{ label: 'a', value: 1 }], percent: true }] });
    expect(out[0]).toEqual({ type: 'chart', kind: 'bar', bars: [{ label: 'a', value: 1 }], percent: true });
  });

  it('chart bar: preserves tone on a segment; no tone field when absent', () => {
    const out = sanitizeWidgets({ widgets: [
      { type: 'chart', kind: 'bar', bars: [{ label: 'a', value: 1, tone: 'warn' }, { label: 'b', value: 2 }] },
    ]});
    expect(out[0]).toEqual({ type: 'chart', kind: 'bar', bars: [{ label: 'a', value: 1, tone: 'warn' }, { label: 'b', value: 2 }] });
  });

  it('chart bar: unknown tone → default', () => {
    const out = sanitizeWidgets({ widgets: [{ type: 'chart', kind: 'bar', bars: [{ label: 'a', value: 1, tone: 'evil' }] }]});
    expect(out[0]).toEqual({ type: 'chart', kind: 'bar', bars: [{ label: 'a', value: 1, tone: 'default' }] });
  });

  it('chart ring: preserves tone on a segment; no tone field when absent', () => {
    const out = sanitizeWidgets({ widgets: [
      { type: 'chart', kind: 'ring', segments: [{ label: '5h', value: 82, tone: 'error' }], max: 100 },
    ]});
    expect(out[0]).toEqual({ type: 'chart', kind: 'ring', segments: [{ label: '5h', value: 82, tone: 'error' }], max: 100 });
  });

  it('colorRow: normalizes value/command, label optional', () => {
    const out = sanitizeWidgets({ widgets: [
      { type: 'colorRow', label: 'L', value: '#abcdef', command: 'usage.setSbColor:claude:5h' },
      { type: 'colorRow', value: 123, command: 'c2' },
    ]});
    expect(out[0]).toEqual({ type: 'colorRow', label: 'L', value: '#abcdef', command: 'usage.setSbColor:claude:5h' });
    expect(out[1]).toEqual({ type: 'colorRow', value: '123', command: 'c2' });
  });

  it('meter: core fields + default max=100', () => {
    const out = sanitizeWidgets({ widgets: [{ type: 'meter', label: '5h', value: 82, text: '82%', caption: '2h15m', tone: 'warn' }] });
    expect(out[0]).toEqual({ type: 'meter', label: '5h', value: 82, max: 100, text: '82%', caption: '2h15m', tone: 'warn' });
  });
  it('meter: broken value → 0; max≤0 → 100', () => {
    const out = sanitizeWidgets({ widgets: [{ type: 'meter', value: 'oops', max: 0 }] });
    expect(out[0]).toEqual({ type: 'meter', value: 0, max: 100 });
  });
  it('meter: explicit max is preserved; optional fields absent when not set', () => {
    const out = sanitizeWidgets({ widgets: [{ type: 'meter', value: 5, max: 50 }] });
    expect(out[0]).toEqual({ type: 'meter', value: 5, max: 50 });
  });
  it('meter: color (valid) is added and lowercased; invalid one is discarded', () => {
    const ok = sanitizeWidgets({ widgets: [{ type: 'meter', value: 1, color: '#ABCDEF' }] });
    expect(ok[0]).toMatchObject({ type: 'meter', color: '#abcdef' });
    const bad = sanitizeWidgets({ widgets: [{ type: 'meter', value: 1, color: 'red' }] });
    expect((bad[0] as { color?: string }).color).toBeUndefined();
  });
  it('meter: unknown tone → default', () => {
    const out = sanitizeWidgets({ widgets: [{ type: 'meter', value: 1, tone: 'evil' }] });
    expect(out[0]).toMatchObject({ type: 'meter', tone: 'default' });
  });

  it('reorder: id is required, widgets are sanitized recursively, text/icon optional', () => {
    const out = sanitizeWidgets({ widgets: [{ type: 'reorder', command: 'cmd', card: true, items: [
      { id: 'a', text: 'A', widgets: [{ type: 'text', text: 'inner' }, { type: 'bogus' }] },
      { id: 'b', icon: '●' },
      { text: 'no-id' },
    ] }] });
    expect(out).toEqual([{ type: 'reorder', command: 'cmd', card: true, items: [
      { id: 'a', text: 'A', widgets: [{ type: 'text', text: 'inner', tone: 'default' }] },
      { id: 'b', icon: '●' },
    ] }]);
  });

  it('reorder: very deep nesting does not blow the stack (depth cap)', () => {
    let inner: unknown = { type: 'text', text: 'x' };
    for (let i = 0; i < 5000; i++) inner = { type: 'reorder', command: 'c', items: [{ id: 'a', widgets: [inner] }] };
    expect(() => sanitizeWidgets({ widgets: [inner] })).not.toThrow();
  });
});

describe('cleanHexColor', () => {
  it('valid #rrggbb → lowercase; otherwise undefined', () => {
    expect(cleanHexColor('#AbCdEf')).toBe('#abcdef');
    expect(cleanHexColor('#abc')).toBeUndefined();
    expect(cleanHexColor('red')).toBeUndefined();
    expect(cleanHexColor(123)).toBeUndefined();
    expect(cleanHexColor(undefined)).toBeUndefined();
  });
});

describe('toneColor', () => {
  it('maps tone to a CSS var, default → --text', () => {
    expect(toneColor('accent')).toBe('var(--accent)');
    expect(toneColor('error')).toBe('var(--red)');
    expect(toneColor()).toBe('var(--text)');
    expect(toneColor('default')).toBe('var(--text)');
  });
});

it('toggle: value coerced to bool, command kept, label optional', () => {
  const [w] = sanitizeWidgets({ widgets: [{ type: 'toggle', label: 'Fill', value: 1, command: 'p.fill' }] });
  expect(w).toEqual({ type: 'toggle', value: true, command: 'p.fill', label: 'Fill' });
  const [w2] = sanitizeWidgets({ widgets: [{ type: 'toggle', value: false, command: 'p.x' }] });
  expect(w2).toEqual({ type: 'toggle', value: false, command: 'p.x' });
});
it('segmented: options sanitized, value/command kept', () => {
  const [w] = sanitizeWidgets({ widgets: [{ type: 'segmented', value: 'meter', command: 'p.viz', options: [{ value: 'meter', label: 'Meter' }, { value: 'rings', label: 'Rings' }] }] });
  expect(w).toEqual({ type: 'segmented', value: 'meter', command: 'p.viz', options: [{ value: 'meter', label: 'Meter' }, { value: 'rings', label: 'Rings' }] });
});
it('reorder item alert flag preserved only when true', () => {
  const [w] = sanitizeWidgets({ widgets: [{ type: 'reorder', command: 'p.ord', items: [{ id: 'a', alert: true }, { id: 'b' }] }] }) as any;
  expect(w.items[0].alert).toBe(true);
  expect(w.items[1].alert).toBeUndefined();
});

describe('Tone pending (cyan)', () => {
  it('cleanTone accepts pending', () => { expect(cleanTone('pending')).toBe('pending'); });
  it('toneColor(pending) → var(--cyan)', () => { expect(toneColor('pending')).toBe('var(--cyan)'); });
  it('unknown tone → default (regression intact)', () => { expect(cleanTone('evil')).toBe('default'); });
  it('existing tones resolve as before', () => {
    expect(toneColor('accent')).toBe('var(--accent)');
    expect(toneColor('success')).toBe('var(--green)');
    expect(toneColor('warn')).toBe('var(--amber)');
    expect(toneColor('error')).toBe('var(--red)');
  });
});
