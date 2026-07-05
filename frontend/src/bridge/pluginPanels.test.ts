import { describe, it, expect } from 'vitest';
import { decideActivation, pluginPanels, setActivePanel, __resetForTests } from './pluginPanels.svelte';

describe('decideActivation (model A)', () => {
  it('closed → open + select', () => {
    expect(decideActivation(false, null, 'p1')).toEqual({ toggleArea: true, setActive: 'p1' });
  });
  it('open and the same one active → close', () => {
    expect(decideActivation(true, 'p1', 'p1')).toEqual({ toggleArea: true, setActive: null });
  });
  it('open, a different one active → switch', () => {
    expect(decideActivation(true, 'p1', 'p2')).toEqual({ toggleArea: false, setActive: 'p2' });
  });
});

describe('setActivePanel', () => {
  it('writes the active tab per location', () => {
    __resetForTests();
    setActivePanel('bottom', 'pb');
    setActivePanel('right', 'pr');
    expect(pluginPanels.activeBottom).toBe('pb');
    expect(pluginPanels.activeRight).toBe('pr');
  });
});
