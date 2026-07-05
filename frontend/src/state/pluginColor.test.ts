import { describe, it, expect } from 'vitest';
import { pluginAccent } from './pluginColor';

const PALETTE = ['#b8bb26','#83a598','#fabd2f','#d3869b','#fe8019','#8ec07c'];

describe('pluginAccent', () => {
  it('deterministic: one id → one color', () => {
    expect(pluginAccent('dev.term.git')).toBe(pluginAccent('dev.term.git'));
  });
  it('result is always from the palette', () => {
    for (const id of ['a','dev.term.git','dev.term.demo','x','', 'usage-watcher'])
      expect(PALETTE).toContain(pluginAccent(id));
  });
  it('empty string does not crash and yields a color from the palette', () => {
    expect(PALETTE).toContain(pluginAccent(''));
  });
  it('different ids can yield different colors (the palette is used)', () => {
    const seen = new Set(['a','b','c','d','e','f','g','h'].map(pluginAccent));
    expect(seen.size).toBeGreaterThan(1);
  });
});
