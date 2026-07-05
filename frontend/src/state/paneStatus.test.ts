import { describe, it, expect } from 'vitest';
import { paneStatus, paneStatusDotColor, tabStatus, spaceStatus, navStatus } from './paneStatus';
import { newTab, newSpace } from './types';
import type { Tab } from './types';
function leafIdOf(tab: Tab): string { return tab.activePaneId; } // single-leaf tab
const noExit = () => false;
describe('paneStatus priority', () => {
  it('active beats alert+exited', () => {
    expect(paneStatus('p', { isActive: true, alertCount: 5, exited: true })).toBe('active');
  });
  it('alert on an inactive pane with a counter', () => {
    expect(paneStatus('p', { isActive: false, alertCount: 2, exited: true })).toBe('alert');
  });
  it('exited when there is no alert', () => {
    expect(paneStatus('p', { isActive: false, alertCount: 0, exited: true })).toBe('exited');
  });
  it('idle by default', () => {
    expect(paneStatus('p', { isActive: false, alertCount: 0, exited: false })).toBe('idle');
  });
});
describe('paneStatusDotColor', () => {
  it('maps status to a CSS variable/value', () => {
    expect(paneStatusDotColor('active')).toBe('var(--accent)');
    expect(paneStatusDotColor('running')).toBe('var(--green)');
    expect(paneStatusDotColor('alert')).toBe('var(--alert)');
    expect(paneStatusDotColor('exited')).toBe('var(--exit)');
    expect(paneStatusDotColor('idle')).toBe('var(--idle)');
  });
});
describe('tabStatus aggregate', () => {
  it('1 leaf without alert/exit → idle', () => {
    const tab = newTab();
    expect(tabStatus(tab, { activePaneId: null, alertCounts: {}, isExited: noExit })).toBe('idle');
  });
  it('leaf with alert → alert', () => {
    const tab = newTab(); const id = leafIdOf(tab);
    expect(tabStatus(tab, { activePaneId: null, alertCounts: { [id]: 3 }, isExited: noExit })).toBe('alert');
  });
  it('activePaneId matches the leaf → active even with alert', () => {
    const tab = newTab(); const id = leafIdOf(tab);
    expect(tabStatus(tab, { activePaneId: id, alertCounts: { [id]: 3 }, isExited: noExit })).toBe('active');
  });
  it('leaf exited without alert → exited', () => {
    const tab = newTab(); const id = leafIdOf(tab);
    expect(tabStatus(tab, { activePaneId: null, alertCounts: {}, isExited: (x) => x === id })).toBe('exited');
  });
});
describe('spaceStatus fold', () => {
  it('one tab alert → alert', () => {
    const sp = newSpace('s'); const id = sp.tabs[0]!.activePaneId;
    expect(spaceStatus(sp, { activePaneId: null, alertCounts: { [id]: 1 }, isExited: noExit })).toBe('alert');
  });
  it('active tab overrides an alert tab', () => {
    const sp = newSpace('s'); const id = sp.tabs[0]!.activePaneId;
    expect(spaceStatus(sp, { activePaneId: id, alertCounts: { [id]: 1 }, isExited: noExit })).toBe('active');
  });
});

// NavRow template for navStatus tests (kind=tab, not active)
const tabRow = { kind: 'tab' as const, spaceId: 's1', tabId: 't1', label: 'x', depth: 1, expandable: false, collapsed: false, active: false };

describe('navStatus — navigator row status', () => {
  it('active beats everything', () => {
    expect(navStatus({ ...tabRow, active: true }, { alertCount: 5, leafIds: ['p1'], exited: { p1: 0 }, isLive: () => true })).toBe('active');
  });
  it('alert>0 → alert (without active)', () => {
    expect(navStatus(tabRow, { alertCount: 2, leafIds: ['p1'], exited: {}, isLive: () => true })).toBe('alert');
  });
  it('exited leaf → exited (without alert)', () => {
    expect(navStatus(tabRow, { alertCount: 0, leafIds: ['p1'], exited: { p1: 0 }, isLive: () => false })).toBe('exited');
  });
  it('live leaf → running', () => {
    expect(navStatus(tabRow, { alertCount: 0, leafIds: ['p1'], exited: {}, isLive: (id) => id === 'p1' })).toBe('running');
  });
  it('empty → idle', () => {
    expect(navStatus(tabRow, { alertCount: 0, leafIds: ['p1'], exited: {}, isLive: () => false })).toBe('idle');
  });
});
