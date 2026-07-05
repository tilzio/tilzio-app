import { describe, it, expect } from 'vitest';
import { runningCount, alertCount } from './statusCounts';
import { terminalCount } from './selectors';
import { initialState, newTab, newEditorLeaf } from './types';
import type { AppState } from './types';
// Layout of 4 terminals: a space with one tab, root = 4 leaves via newTab.
function fourTerminals(): { app: AppState; ids: string[] } {
  const app = initialState();
  const sp = app.spaces[0]!;
  sp.tabs = [newTab(), newTab(), newTab(), newTab()];
  sp.activeTabId = sp.tabs[0]!.id;
  const ids = sp.tabs.map((t) => t.activePaneId);
  return { app, ids };
}
describe('runningCount', () => {
  it('4 terminals, one exited → 3', () => {
    const { app, ids } = fourTerminals();
    expect(runningCount(app, (id) => id === ids[0])).toBe(3);
  });
  it('all alive → 4', () => {
    const { app } = fourTerminals();
    expect(runningCount(app, () => false)).toBe(4);
  });
  it('all exited → 0', () => {
    const { app } = fourTerminals();
    expect(runningCount(app, () => true)).toBe(0);
  });
  it('editor leaf is not counted as running', () => {
    const app = initialState();
    const sp = app.spaces[0]!;
    const t = sp.tabs[0]!;
    t.root = newEditorLeaf('/x.md'); // editor tab, not a terminal
    expect(runningCount(app, () => false)).toBe(0);
  });
});
describe('alertCount', () => {
  it('two panes with counts>0 → 2 (number of panes, not the sum)', () => {
    const { app, ids } = fourTerminals();
    expect(alertCount(app, { [ids[0]!]: 3, [ids[1]!]: 1 })).toBe(2);
  });
  it('empty counts → 0', () => {
    const { app } = fourTerminals();
    expect(alertCount(app, {})).toBe(0);
  });
  it('orphaned count (paneId not in the layout) is ignored', () => {
    const { app, ids } = fourTerminals();
    expect(alertCount(app, { [ids[0]!]: 1, ghost: 9 })).toBe(1);
  });
  it('sanity: terminalCount === 4', () => {
    const { app } = fourTerminals();
    expect(terminalCount(app)).toBe(4);
  });
});
