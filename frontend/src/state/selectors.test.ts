import { describe, it, expect } from 'vitest';
import { initialState, type Leaf, type TerminalLeaf, newLeaf, newEditorLeaf, newSplit, newSpace } from './types';
import type { AppState, Tab, Space } from './types';
import { addSpace, addTab, setActiveSpace } from './reducers';
import { navigatorRows, breadcrumbParts, activeTerminal, leafIds, collectLeaves, findLeaf, firstLeaf, terminalCount, pluralConsoles, firstEditorLeaf, editorOpenTarget, editorFilesIn, allEditorFiles, openedFileId, findLeafInApp, locatePane, paneLabel } from './selectors';
import { tabAlertCount, spaceAlertCount } from './selectors';

describe('navigatorRows', () => {
  it('a one-tab space is a single non-expandable row', () => {
    const rows = navigatorRows(initialState());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'space', depth: 0, expandable: false, active: true });
  });

  it('navigatorRows: a space row carries tabCount = number of tabs', () => {
    const base = initialState();
    const sid = base.spaces[0].id;
    // 3 tabs
    let s = addTab(base, sid, 'tab2');
    s = addTab(s, sid, 'tab3');
    const spaceRow = navigatorRows(s).find((r) => r.kind === 'space')!;
    expect(spaceRow.tabCount).toBe(3);
  });

  it('navigatorRows: tab rows have tabCount 0', () => {
    const base = initialState();
    const sid = base.spaces[0].id;
    const s = addTab(base, sid, 'tab2');
    const tabRow = navigatorRows(s).find((r) => r.kind === 'tab')!;
    expect(tabRow.tabCount).toBe(0);
  });

  it('a multi-tab space expands into tab rows when not collapsed', () => {
    const base = initialState();
    const sid = base.spaces[0].id;
    const s = addTab(base, sid, 't2'); // 2 tabs now
    const rows = navigatorRows(s);
    expect(rows[0]).toMatchObject({ kind: 'space', expandable: true });
    expect(rows.filter((r) => r.kind === 'tab')).toHaveLength(2);
    const activeTab = rows.find((r) => r.kind === 'tab' && r.active);
    expect(activeTab?.tabId).toBe(s.spaces[0].activeTabId);
  });

  it('a collapsed multi-tab space hides its tab rows', () => {
    const base = initialState();
    const sid = base.spaces[0].id;
    let s = addTab(base, sid, 't2');
    s = { ...s, spaces: s.spaces.map((sp) => ({ ...sp, collapsed: true })) };
    const rows = navigatorRows(s);
    expect(rows.filter((r) => r.kind === 'tab')).toHaveLength(0);
    expect(rows[0].collapsed).toBe(true);
  });
});

describe('breadcrumbParts', () => {
  it('one-tab space shows only the space name', () => {
    expect(breadcrumbParts(initialState())).toEqual(['space 1']);
  });

  it('multi-tab space shows space and active tab', () => {
    const base = initialState();
    const sid = base.spaces[0].id;
    const s = addTab(base, sid, 't2');
    const parts = breadcrumbParts(s);
    expect(parts[0]).toBe('space 1');
    expect(parts[1]).toBe('t2');
  });
});

describe('activeTerminal', () => {
  it('returns the active tab leaf paneId + cwd', () => {
    const s = initialState();
    const leaf = s.spaces[0].tabs[0].root as Leaf;
    expect(activeTerminal(s)).toEqual({ paneId: leaf.id, cwd: (leaf as TerminalLeaf).cwd });
  });

  it('follows the active space after a switch', () => {
    let s = addSpace(initialState(), 'two');
    s = setActiveSpace(s, s.spaces[1].id);
    const leaf = s.spaces[1].tabs[0].root as Leaf;
    expect(activeTerminal(s)?.paneId).toBe(leaf.id);
  });

  it('falls back to the first leaf when activePaneId is stale', () => {
    const base = initialState();
    const realLeaf = base.spaces[0].tabs[0].root as Leaf;
    // Simulate a stale activePaneId pointing at a pane no longer in the tree.
    const s = {
      ...base,
      spaces: base.spaces.map((sp, i) =>
        i === 0
          ? { ...sp, tabs: sp.tabs.map((t, j) => (j === 0 ? { ...t, activePaneId: 'gone' } : t)) }
          : sp,
      ),
    };
    expect(activeTerminal(s)?.paneId).toBe(realLeaf.id); // firstLeaf fallback
  });
});

import { activeTab } from './selectors';

describe('activeTab', () => {
  it('returns the active tab of the active space', () => {
    const s = initialState();
    expect(activeTab(s)?.id).toBe(s.spaces[0].activeTabId);
  });

  it('follows the active space after a switch', () => {
    let s = addSpace(initialState(), 'two');
    s = setActiveSpace(s, s.spaces[1].id);
    expect(activeTab(s)?.id).toBe(s.spaces[1].activeTabId);
  });
});

describe('collectLeaves', () => {
  it('returns leaves left-to-right', () => {
    const a = newLeaf(), b = newLeaf(), c = newLeaf();
    const tree = newSplit('h', [newSplit('v', [a, b]), c]);
    expect(collectLeaves(tree)).toEqual([a, b, c]);
  });
  it('a single leaf → a single element', () => {
    const a = newLeaf();
    expect(collectLeaves(a)).toEqual([a]);
  });
});

describe('leafIds', () => {
  it('returns the id of a single leaf', () => {
    const leaf = newLeaf();
    expect(leafIds(leaf)).toEqual([leaf.id]);
  });

  it('collects all leaf ids in tree order', () => {
    const a = newLeaf(), b = newLeaf(), c = newLeaf();
    const tree = newSplit('v', [a, newSplit('h', [b, c])]);
    expect(leafIds(tree)).toEqual([a.id, b.id, c.id]);
  });
});

describe('alert counts', () => {
  it('tabAlertCount = sum of the tab leaves counters', () => {
    const a = newLeaf(), b = newLeaf();
    const tab: Tab = { id: 't', title: 't', activePaneId: a.id, zoomedPaneId: null, root: newSplit('v', [a, b]) };
    expect(tabAlertCount({ [a.id]: 2, [b.id]: 3 }, tab)).toBe(5);
    expect(tabAlertCount({}, tab)).toBe(0);
  });
  it('spaceAlertCount = sum over tabs', () => {
    const a = newLeaf(), b = newLeaf();
    const t1: Tab = { id: 't1', title: '', activePaneId: a.id, zoomedPaneId: null, root: a };
    const t2: Tab = { id: 't2', title: '', activePaneId: b.id, zoomedPaneId: null, root: b };
    const space: Space = { id: 's', name: '', collapsed: false, activeTabId: 't1', tabs: [t1, t2] };
    expect(spaceAlertCount({ [a.id]: 1, [b.id]: 4 }, space)).toBe(5);
  });
});

describe('terminalCount', () => {
  it('a single tab = 1', () => {
    expect(terminalCount(initialState())).toBe(1);
  });
  it('sums leaves across splits, tabs and spaces', () => {
    const s = initialState();
    s.spaces[0].tabs[0].root = newSplit('v', [newLeaf(), newLeaf()]); // 2 leaves
    s.spaces.push(newSpace('space 2'));                                // +1 leaf
    expect(terminalCount(s)).toBe(3);
  });
});

describe('pluralConsoles', () => {
  it('returns singular for 1, plural otherwise', () => {
    expect(pluralConsoles(1)).toBe('console');
    expect(pluralConsoles(2)).toBe('consoles');
    expect(pluralConsoles(4)).toBe('consoles');
    expect(pluralConsoles(5)).toBe('consoles');
    expect(pluralConsoles(11)).toBe('consoles');
    expect(pluralConsoles(14)).toBe('consoles');
    expect(pluralConsoles(21)).toBe('consoles');
    expect(pluralConsoles(22)).toBe('consoles');
    expect(pluralConsoles(0)).toBe('consoles');
  });
});

describe('editor selectors (§5.5)', () => {
  it('firstEditorLeaf finds the first editor leaf or null', () => {
    const root = newSplit('v', [newLeaf('/t'), newEditorLeaf('/a.ts')]);
    expect(firstEditorLeaf(root)?.kind).toBe('editor');
    expect(firstEditorLeaf(newLeaf('/t'))).toBeNull();
  });
  it('editorOpenTarget prefers the active pane when it is an editor', () => {
    const ed = newEditorLeaf('/a.ts');
    const root = newSplit('v', [newLeaf('/t'), ed]);
    expect(editorOpenTarget(root, ed.id)?.id).toBe(ed.id);
  });
  it('editorOpenTarget falls back to the first editor when active is a terminal', () => {
    const t = newLeaf('/t');
    const ed = newEditorLeaf('/a.ts');
    const root = newSplit('v', [t, ed]);
    expect(editorOpenTarget(root, t.id)?.id).toBe(ed.id);
  });
  it('editorOpenTarget is null when there is no editor in the tab', () => {
    const root = newSplit('v', [newLeaf('/a'), newLeaf('/b')]);
    expect(editorOpenTarget(root, root.children[0].id)).toBeNull();
  });
});

describe('selectors with editor leaves', () => {
  it('collectLeaves walks a mixed terminal+editor tree', () => {
    const t = newLeaf('/a');
    const e = newEditorLeaf('/x.md');
    const root = newSplit('v', [t, e]);
    const leaves = collectLeaves(root);
    expect(leaves.map((l) => l.id).sort()).toEqual([t.id, e.id].sort());
  });

  it('findLeaf locates an editor leaf by id', () => {
    const e = newEditorLeaf('/x.md');
    const root = newSplit('h', [newLeaf('/a'), e]);
    expect(findLeaf(root, e.id)).toBe(e);
  });

  it('firstLeaf returns an editor leaf when it is leftmost', () => {
    const e = newEditorLeaf('/x.md');
    expect(firstLeaf(newSplit('v', [e, newLeaf('/a')]))).toBe(e);
  });
});

describe('editor file selectors (B4b/c)', () => {
  it('editorFilesIn collects EditorFiles across editor leaves of a subtree', () => {
    const ed = newEditorLeaf('/a.ts');
    const root = newSplit('v', [newLeaf('/t'), ed]);
    const fs = editorFilesIn(root);
    expect(fs).toHaveLength(1);
    expect(fs[0].path).toBe('/a.ts');
  });

  it('editorFilesIn returns [] when there is no editor in the subtree', () => {
    expect(editorFilesIn(newLeaf('/t'))).toEqual([]);
  });

  it('allEditorFiles spans every space and tab', () => {
    const s = initialState();
    s.spaces[0].tabs[0].root = newSplit('v', [newLeaf('/t'), newEditorLeaf('/a.ts')]);
    const fs = allEditorFiles(s);
    expect(fs.map((f) => f.path)).toContain('/a.ts');
  });
});

describe('openedFileId', () => {
  it('returns the activeFileId of the active leaf when it is an editor', () => {
    const leaf = newEditorLeaf('/proj/a.ts');
    const space = newSpace('s');
    const tab = space.tabs[0];
    tab.root = leaf;
    tab.activePaneId = leaf.id;
    const state: AppState = { activeSpaceId: space.id, spaces: [space] };
    expect(openedFileId(state)).toBe(leaf.activeFileId);
  });

  it('returns null when the active leaf is a terminal', () => {
    const space = newSpace('s'); // newSpace → terminal leaf
    const state: AppState = { activeSpaceId: space.id, spaces: [space] };
    expect(openedFileId(state)).toBeNull();
  });
});

describe('findLeafInApp', () => {
  const app: any = {
    activeSpaceId: 's1',
    spaces: [{ id: 's1', name: 'S', collapsed: false, activeTabId: 't1', tabs: [
      { id: 't1', title: 'T', activePaneId: 'term1', zoomedPaneId: null, root: {
        kind: 'split', id: 'sp', dir: 'v', ratio: [0.5, 0.5], children: [
          { kind: 'terminal', id: 'term1', cwd: '/a' },
          { kind: 'editor', id: 'ed1', files: [] },
        ] } } ] }],
  };
  it('finds a terminal leaf by id', () => { expect(findLeafInApp(app, 'term1')?.kind).toBe('terminal'); });
  it('finds an editor leaf', () => { expect(findLeafInApp(app, 'ed1')?.kind).toBe('editor'); });
  it('unknown id → undefined', () => { expect(findLeafInApp(app, 'nope')).toBeUndefined(); });
});

describe('locatePane / paneLabel', () => {
  it('locatePane finds a leaf in the active tab', () => {
    const s = initialState();
    const leaf = s.spaces[0].tabs[0].root as Leaf;
    expect(locatePane(s, leaf.id)).toEqual({ spaceId: s.spaces[0].id, tabId: s.spaces[0].tabs[0].id, paneId: leaf.id });
  });
  it('locatePane finds a leaf in the second tab of a NON-active space', () => {
    let s = addSpace(initialState());                 // the 2nd space is not active
    const sp2 = s.spaces[1];
    s = addTab(s, sp2.id, 't2');                       // sp2 now has 2 tabs
    const sp2b = s.spaces[1];
    const leaf = sp2b.tabs[1].root as Leaf;
    expect(locatePane(s, leaf.id)).toEqual({ spaceId: sp2b.id, tabId: sp2b.tabs[1].id, paneId: leaf.id });
  });
  it('locatePane for a non-existent id → null', () => {
    expect(locatePane(initialState(), 'nope')).toBeNull();
  });
  it('paneLabel: terminal with title → title', () => {
    const s = initialState();
    const t = s.spaces[0].tabs[0].root as TerminalLeaf;
    (t as TerminalLeaf).title = 'build';
    expect(paneLabel(s, t.id)).toBe('build');
  });
  it('paneLabel: terminal without title → basename(cwd)', () => {
    const s = initialState();
    const t = s.spaces[0].tabs[0].root as TerminalLeaf;
    t.cwd = '/Users/x/proj/api-gateway';
    expect(paneLabel(s, t.id)).toBe('api-gateway');
  });
  it('paneLabel: editor → basename of the active file', () => {
    let s = initialState();
    const ed = newEditorLeaf('/Users/x/proj/main.ts');
    s.spaces[0].tabs[0].root = ed;                     // replace the leaf with an editor
    expect(paneLabel(s, ed.id)).toBe('main.ts');
  });
  it('paneLabel: non-existent → null', () => {
    expect(paneLabel(initialState(), 'nope')).toBeNull();
  });
});
