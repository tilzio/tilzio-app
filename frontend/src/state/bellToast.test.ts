import { describe, it, expect } from 'vitest';
import { initialState, type TerminalLeaf } from './types';
import { addSpace, addTab } from './reducers';
import { buildBellToast, staleBellPanes } from './bellToast';

describe('staleBellPanes', () => {
  it('empty live → all paneIds are stale', () => {
    const bell = new Map<string, number>([['p1', 10], ['p2', 20]]);
    expect(staleBellPanes(bell, new Set<number>()).sort()).toEqual(['p1', 'p2']);
  });
  it('all live → empty', () => {
    const bell = new Map<string, number>([['p1', 10], ['p2', 20]]);
    expect(staleBellPanes(bell, new Set<number>([10, 20]))).toEqual([]);
  });
  it('partial: returns only the missing toastIds', () => {
    const bell = new Map<string, number>([['p1', 10], ['p2', 20]]);
    expect(staleBellPanes(bell, new Set<number>([10]))).toEqual(['p2']);
  });
});

describe('buildBellToast', () => {
  it('null if the pane is not found', () => {
    expect(buildBellToast(initialState(), 'nope')).toBeNull();
  });
  it('title = "<label> · waiting for input", body contains the space and the label', () => {
    const s = initialState();
    const t = s.spaces[0].tabs[0].root as TerminalLeaf;
    t.title = 'tests';
    const r = buildBellToast(s, t.id);
    expect(r?.title).toBe('tests · waiting for input');
    expect(r?.body).toContain(s.spaces[0].name);
    expect(r?.body).toContain('tests');
  });
  it('loc — correct leaf location in the second tab', () => {
    let s = addSpace(initialState());
    s = addTab(s, s.spaces[1].id, 't2');
    const leaf = s.spaces[1].tabs[1].root as TerminalLeaf;
    const r = buildBellToast(s, leaf.id);
    expect(r?.loc).toEqual({ spaceId: s.spaces[1].id, tabId: s.spaces[1].tabs[1].id, paneId: leaf.id });
  });
});
