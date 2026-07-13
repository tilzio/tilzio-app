import { describe, it, expect } from 'vitest';
import { initialState, type AppState } from './types';
import * as R from './reducers';
import { collectLeaves } from './selectors';
import { removedTerminalPanes, terminalPaneIds } from './paneLifecycle';

// Helpers over real reducers — the diff must see exactly what the store commits.
function firstTab(s: AppState) {
  return s.spaces[0].tabs[0];
}
function termIds(s: AppState): string[] {
  return s.spaces.flatMap((sp) => sp.tabs.flatMap((t) => collectLeaves(t.root)))
    .filter((l) => l.kind === 'terminal')
    .map((l) => l.id);
}

describe('terminalPaneIds', () => {
  it('collects terminal leaves across every space and tab', () => {
    let s = initialState();
    s = R.addSpace(s, 'two');
    const ids = terminalPaneIds(s);
    expect([...ids].sort()).toEqual(termIds(s).sort());
    expect(ids.size).toBe(2); // one default terminal per space
  });

  it('excludes editor leaves', () => {
    let s = initialState();
    const term = firstTab(s).root.id;
    s = R.splitAsEditor(s, term, 'v');
    const editor = collectLeaves(firstTab(s).root).find((l) => l.kind === 'editor')!;
    const ids = terminalPaneIds(s);
    expect(ids.has(term)).toBe(true);
    expect(ids.has(editor.id)).toBe(false);
  });
});

describe('removedTerminalPanes', () => {
  it('reports a terminal pane removed by closePane', () => {
    let before = initialState();
    const keep = firstTab(before).root.id;
    before = R.splitPane(before, keep, 'v');
    const added = termIds(before).find((id) => id !== keep)!;
    const after = R.closePane(before, added);
    expect(removedTerminalPanes(before, after)).toEqual([added]);
  });

  it('reports every terminal of a closed tab', () => {
    let before = initialState();
    const space = before.spaces[0];
    before = R.addTab(before, space.id, 'second');
    const tab1 = before.spaces[0].tabs[0];
    before = R.splitPane(before, tab1.root.id, 'v');
    const tab1Ids = collectLeaves(before.spaces[0].tabs[0].root).map((l) => l.id);
    const after = R.closeTab(before, space.id, tab1.id);
    expect(removedTerminalPanes(before, after).sort()).toEqual([...tab1Ids].sort());
  });

  it('reports terminals of a removed space', () => {
    let before = initialState();
    before = R.addSpace(before, 'two');
    const space2 = before.spaces[1];
    const space2Term = space2.tabs[0].root.id;
    const after = R.removeSpace(before, space2.id);
    expect(removedTerminalPanes(before, after)).toEqual([space2Term]);
  });

  it('does NOT report a pane moved within the tab (movePane)', () => {
    let before = initialState();
    const a = firstTab(before).root.id;
    before = R.splitPane(before, a, 'v');
    const b = termIds(before).find((id) => id !== a)!;
    const after = R.movePane(before, b, { kind: 'edge', leafId: a, side: 'left' });
    expect(removedTerminalPanes(before, after)).toEqual([]);
  });

  it('does NOT report panes of a tab moved to another space', () => {
    let before = initialState();
    before = R.addSpace(before, 'two');
    const tab1 = before.spaces[0].tabs[0];
    const after = R.moveTab(before, tab1.id, before.spaces[1].id, 0);
    expect(removedTerminalPanes(before, after)).toEqual([]);
  });

  it('does NOT report the removal of an editor leaf (closePane on editor)', () => {
    let before = initialState();
    const term = firstTab(before).root.id;
    before = R.splitAsEditor(before, term, 'v');
    const editor = collectLeaves(firstTab(before).root).find((l) => l.kind === 'editor')!;
    const after = R.closePane(before, editor.id);
    expect(removedTerminalPanes(before, after)).toEqual([]);
  });

  it('convertPaneToTerminal (editor→terminal swap) reports nothing', () => {
    let before = initialState();
    const term = firstTab(before).root.id;
    before = R.splitAsEditor(before, term, 'v');
    const editor = collectLeaves(firstTab(before).root).find((l) => l.kind === 'editor')!;
    const after = R.convertPaneToTerminal(before, editor.id);
    expect(removedTerminalPanes(before, after)).toEqual([]);
  });

  it('reports nothing on an unrelated change (rename)', () => {
    const before = initialState();
    const after = R.renameSpace(before, before.spaces[0].id, 'renamed');
    expect(removedTerminalPanes(before, after)).toEqual([]);
  });
});
