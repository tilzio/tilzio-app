import { describe, it, expect } from 'vitest';
import { initialState, newEditorLeaf, newPluginLeaf } from './types';
import {
  addSpace, removeSpace, renameSpace, reorderSpace, toggleCollapsed, setActiveSpace,
  addTab, closeTab, renameTab, setActiveTab, setPaneTitle, setEditorMode,
  splitPane, movePane, moveLeafToNav,
  splitAsEditor, openFileInPane, openFileInNewSplit, closeEditorFile, setActiveEditorFile, convertPaneToTerminal,
  setTermFontSize, setEditorFontSize,
  openPluginView,
} from './reducers';

describe('space reducers', () => {
  it('addSpace appends a space and makes it active', () => {
    const s0 = initialState();
    const s1 = addSpace(s0, 'two');
    expect(s1.spaces).toHaveLength(2);
    expect(s1.spaces[1].name).toBe('two');
    expect(s1.activeSpaceId).toBe(s1.spaces[1].id);
    expect(s0.spaces).toHaveLength(1); // input not mutated
  });

  it('removeSpace drops it and re-points active to a neighbor', () => {
    let s = addSpace(initialState(), 'two');
    const firstId = s.spaces[0].id;
    s = setActiveSpace(s, firstId);
    const removed = removeSpace(s, firstId);
    expect(removed.spaces).toHaveLength(1);
    expect(removed.activeSpaceId).toBe(removed.spaces[0].id);
  });

  it('removeSpace on the last space yields a fresh default', () => {
    const s = initialState();
    const removed = removeSpace(s, s.spaces[0].id);
    expect(removed.spaces).toHaveLength(1);
    expect(removed.spaces[0].id).not.toBe(s.spaces[0].id);
  });

  it('renameSpace changes the name', () => {
    const s = initialState();
    const r = renameSpace(s, s.spaces[0].id, 'renamed');
    expect(r.spaces[0].name).toBe('renamed');
  });

  it('reorderSpace moves a space to a new index', () => {
    let s = addSpace(addSpace(initialState(), 'b'), 'c'); // [space 1, b, c]
    const cId = s.spaces[2].id;
    s = reorderSpace(s, cId, 0);
    expect(s.spaces.map((x) => x.id)[0]).toBe(cId);
  });

  it('toggleCollapsed flips the flag', () => {
    const s = initialState();
    const t = toggleCollapsed(s, s.spaces[0].id);
    expect(t.spaces[0].collapsed).toBe(true);
  });

  it('setActiveSpace only accepts an existing id', () => {
    const s = addSpace(initialState(), 'two');
    expect(setActiveSpace(s, 'nope')).toBe(s);
    const id = s.spaces[0].id;
    expect(setActiveSpace(s, id).activeSpaceId).toBe(id);
  });

  it('setActiveSpace on the already-active id is a no-op (same ref)', () => {
    const s = addSpace(initialState(), 'two');
    expect(setActiveSpace(s, s.activeSpaceId)).toBe(s);
  });
});

describe('tab reducers', () => {
  it('addTab appends a tab, activates it, and activates the space', () => {
    const s0 = addSpace(initialState(), 'two'); // active = two (1 tab)
    const sid = s0.spaces[0].id;
    const s1 = addTab(s0, sid, 't2');
    expect(s1.spaces[0].tabs).toHaveLength(2);
    expect(s1.activeSpaceId).toBe(sid);
    expect(s1.spaces[0].activeTabId).toBe(s1.spaces[0].tabs[1].id);
  });

  it('closeTab on a multi-tab space removes it and re-points active', () => {
    const base = initialState();
    const sid = base.spaces[0].id;
    const s = addTab(base, sid, 't2'); // tabs: [t1, t2], active t2
    const t2 = s.spaces[0].tabs[1].id;
    const closed = closeTab(s, sid, t2);
    expect(closed.spaces[0].tabs).toHaveLength(1);
    expect(closed.spaces[0].activeTabId).toBe(closed.spaces[0].tabs[0].id);
  });

  it('closeTab on the only tab closes the whole space (one-tab-space rule)', () => {
    const s = addSpace(initialState(), 'two'); // 2 spaces, each 1 tab
    const sid = s.spaces[1].id;
    const onlyTab = s.spaces[1].tabs[0].id;
    const closed = closeTab(s, sid, onlyTab);
    expect(closed.spaces.find((sp) => sp.id === sid)).toBeUndefined();
    expect(closed.spaces).toHaveLength(1);
  });

  it('renameTab changes the title', () => {
    const base = initialState();
    const sid = base.spaces[0].id;
    const tid = base.spaces[0].tabs[0].id;
    const r = renameTab(base, sid, tid, 'edited');
    expect(r.spaces[0].tabs[0].title).toBe('edited');
  });

  it('setActiveTab activates both the tab and its space', () => {
    let s = addSpace(initialState(), 'two'); // active = two
    const sid = s.spaces[0].id; // space 1, not active
    s = addTab(s, sid, 't2');
    const t1 = s.spaces[0].tabs[0].id;
    const r = setActiveTab(s, sid, t1);
    expect(r.activeSpaceId).toBe(sid);
    expect(r.spaces[0].activeTabId).toBe(t1);
  });

  it('setActiveTab on the already-active tab is a no-op (same ref)', () => {
    const s = addSpace(initialState(), 'two');
    const sid = s.activeSpaceId;
    const tid = s.spaces.find((sp) => sp.id === sid)!.activeTabId;
    expect(setActiveTab(s, sid, tid)).toBe(s);
  });

  it('closeTab on an unknown tab is a no-op (same ref)', () => {
    const base = initialState();
    const sid = base.spaces[0].id;
    const s = addTab(base, sid, 't2'); // multi-tab so it does not trigger removeSpace
    expect(closeTab(s, sid, 'nope')).toBe(s);
  });
});

import { newLeaf, newSplit } from './types';
import type { AppState, EditorLeaf, Leaf, Space, Split, Tab, TerminalLeaf } from './types';

// Build a one-space/one-tab state whose single leaf has an explicit cwd, so we can
// assert cwd inheritance on split.
function stateWithLeafCwd(cwd: string): { state: AppState; leafId: string } {
  const leaf = newLeaf(cwd);
  const tab: Tab = { id: 't', title: 'x', activePaneId: leaf.id, zoomedPaneId: null, root: leaf };
  const space: Space = { id: 's', name: 's', collapsed: false, activeTabId: 't', tabs: [tab] };
  return { state: { activeSpaceId: 's', spaces: [space] }, leafId: leaf.id };
}

describe('splitPane', () => {
  it('wraps a single-leaf root into a binary split; new leaf inherits cwd; focus moves to new', () => {
    const { state, leafId } = stateWithLeafCwd('/work');
    const r = splitPane(state, leafId, 'v');
    const root = r.spaces[0].tabs[0].root as Split;
    expect(root.kind).toBe('split');
    expect(root.dir).toBe('v');
    expect(root.ratio).toEqual([0.5, 0.5]);
    const [a, b] = root.children as Leaf[];
    expect(a.id).toBe(leafId);
    expect((b as TerminalLeaf).cwd).toBe('/work'); // inherits cwd of the split leaf
    expect(r.spaces[0].tabs[0].activePaneId).toBe(b.id); // focus on new
  });

  it('flattens into a parent split of the same dir; equal siblings stay equal (1/N)', () => {
    const { state, leafId } = stateWithLeafCwd('');
    let s = splitPane(state, leafId, 'v'); // Split[v]: [old, new] @ [.5,.5] (equal)
    const first = (s.spaces[0].tabs[0].root as Split).children[0] as Leaf;
    s = splitPane(s, first.id, 'v'); // same dir → flatten; siblings equal → equalize
    const root = s.spaces[0].tabs[0].root as Split;
    expect(root.children).toHaveLength(3); // flattened, not nested
    expect(root.ratio).toEqual([1 / 3, 1 / 3, 1 / 3]); // equal, not [.25,.25,.5]
  });

  it('flatten in an UNEQUAL split does NOT equalize — halves the split leaf share, siblings preserved', () => {
    const a = newLeaf();
    const b = newLeaf();
    const inner = newSplit('v', [a, b], [0.8, 0.2]); // manually unequal
    const tab: Tab = { id: 't', title: 'x', activePaneId: a.id, zoomedPaneId: null, root: inner };
    const space: Space = { id: 's', name: 's', collapsed: false, activeTabId: 't', tabs: [tab] };
    const r = splitPane({ activeSpaceId: 's', spaces: [space] }, a.id, 'v'); // split A (share 0.8)
    const root = r.spaces[0].tabs[0].root as Split;
    expect(root.children).toHaveLength(3);
    expect(root.ratio[0]).toBeCloseTo(0.4, 5); // 0.8 halved
    expect(root.ratio[1]).toBeCloseTo(0.4, 5);
    expect(root.ratio[2]).toBeCloseTo(0.2, 5); // sibling B kept 0.2
  });

  it('nests a new split when dir differs from the parent', () => {
    const { state, leafId } = stateWithLeafCwd('');
    let s = splitPane(state, leafId, 'v'); // Split[v]
    const first = (s.spaces[0].tabs[0].root as Split).children[0] as Leaf;
    s = splitPane(s, first.id, 'h'); // different dir → nested split replaces first
    const root = s.spaces[0].tabs[0].root as Split;
    expect(root.children[0].kind).toBe('split');
    expect((root.children[0] as Split).dir).toBe('h');
  });

  it('flattens into the immediate parent, not the grandparent, when both share dir', () => {
    // Built by hand: splitPane flattens same-dir, so it cannot itself produce a
    // grandparent[v] > parent[v] nesting. Guard that the recursion targets the
    // immediate parent (design §11.2 "direct parent of the same dir").
    const a = newLeaf();
    const b = newLeaf();
    const c = newLeaf();
    const inner = newSplit('v', [a, b]); // immediate parent of `a` (dir v)
    const outer = newSplit('v', [inner, c]); // grandparent (also dir v)
    const tab: Tab = { id: 't', title: 'x', activePaneId: a.id, zoomedPaneId: null, root: outer };
    const space: Space = { id: 's', name: 's', collapsed: false, activeTabId: 't', tabs: [tab] };
    const r = splitPane({ activeSpaceId: 's', spaces: [space] }, a.id, 'v');
    const root = r.spaces[0].tabs[0].root as Split;
    expect(root.children).toHaveLength(2); // grandparent NOT flattened
    expect((root.children[0] as Split).children).toHaveLength(3); // immediate parent flattened: a, fresh, b
  });

  it('returns the same state when the pane is not in the active tab', () => {
    const { state } = stateWithLeafCwd('');
    expect(splitPane(state, 'nope', 'v')).toBe(state);
  });
});

import { closePane } from './reducers';

describe('closePane', () => {
  it('removes a leaf from a binary split and collapses to the sibling, focus follows', () => {
    const { state, leafId } = stateWithLeafCwd('');
    const s = splitPane(state, leafId, 'v'); // [a, b]
    const [a, b] = (s.spaces[0].tabs[0].root as Split).children as Leaf[];
    const r = closePane(s, b.id);
    expect(r.spaces[0].tabs[0].root.kind).toBe('terminal'); // collapsed
    expect((r.spaces[0].tabs[0].root as Leaf).id).toBe(a.id);
    expect(r.spaces[0].tabs[0].activePaneId).toBe(a.id);
  });

  it('removes the middle of three and renormalizes ratio to sum 1', () => {
    const { state, leafId } = stateWithLeafCwd('');
    let s = splitPane(state, leafId, 'v');
    const first = (s.spaces[0].tabs[0].root as Split).children[0] as Leaf;
    s = splitPane(s, first.id, 'v'); // 3 in a row [⅓,⅓,⅓] (equal)
    const mid = (s.spaces[0].tabs[0].root as Split).children[1] as Leaf;
    const r = closePane(s, mid.id);
    const root = r.spaces[0].tabs[0].root as Split;
    expect(root.children).toHaveLength(2);
    expect(root.ratio.reduce((x, y) => x + y, 0)).toBeCloseTo(1.0);
  });

  it('closing the only pane of a one-tab space closes the space (one-tab-space rule)', () => {
    const s = addSpace(initialState(), 'two'); // 2 spaces, active = "two"
    const sid = s.spaces[1].id;
    const paneId = (s.spaces[1].tabs[0].root as Leaf).id;
    const r = closePane(s, paneId);
    expect(r.spaces.find((sp) => sp.id === sid)).toBeUndefined();
    expect(r.spaces).toHaveLength(1);
  });

  it('resets zoom when the zoomed pane is closed', () => {
    const { state, leafId } = stateWithLeafCwd('');
    let s = splitPane(state, leafId, 'v');
    const [, b] = (s.spaces[0].tabs[0].root as Split).children as Leaf[];
    const tabId = s.spaces[0].tabs[0].id;
    s = setZoom(s, tabId, b.id);
    const r = closePane(s, b.id);
    expect(r.spaces[0].tabs[0].zoomedPaneId).toBeNull();
  });

  it('returns the same state when the pane is not in the active tab', () => {
    const { state } = stateWithLeafCwd('');
    expect(closePane(state, 'nope')).toBe(state);
  });
});

import { setRatio, setZoom, focusPane } from './reducers';
// setZoom is also used in Task 3's block (imported once here).

describe('setRatio', () => {
  it('sets the ratio of a split by id', () => {
    const { state, leafId } = stateWithLeafCwd('');
    const s = splitPane(state, leafId, 'v');
    const split = s.spaces[0].tabs[0].root as Split;
    const r = setRatio(s, split.id, [0.7, 0.3]);
    expect((r.spaces[0].tabs[0].root as Split).ratio).toEqual([0.7, 0.3]);
  });

  it('ignores a ratio whose length does not match the children', () => {
    const { state, leafId } = stateWithLeafCwd('');
    const s = splitPane(state, leafId, 'v');
    const split = s.spaces[0].tabs[0].root as Split;
    const r = setRatio(s, split.id, [1.0]);
    expect((r.spaces[0].tabs[0].root as Split).ratio).toEqual([0.5, 0.5]);
  });

  it('rejects non-finite, negative, and all-zero ratios (same ref)', () => {
    const { state, leafId } = stateWithLeafCwd('');
    const s = splitPane(state, leafId, 'v');
    const split = s.spaces[0].tabs[0].root as Split;
    expect(setRatio(s, split.id, [NaN, 0.5])).toBe(s);
    expect(setRatio(s, split.id, [Infinity, 0.5])).toBe(s);
    expect(setRatio(s, split.id, [-0.2, 1.2])).toBe(s);
    expect(setRatio(s, split.id, [0, 0])).toBe(s);      // sum must be > 0
  });
});

describe('setZoom', () => {
  it('sets and clears the zoomed pane of a tab', () => {
    const s = initialState();
    const tabId = s.spaces[0].tabs[0].id;
    const paneId = (s.spaces[0].tabs[0].root as Leaf).id;
    const z = setZoom(s, tabId, paneId);
    expect(z.spaces[0].tabs[0].zoomedPaneId).toBe(paneId);
    expect(setZoom(z, tabId, null).spaces[0].tabs[0].zoomedPaneId).toBeNull();
  });

  it('ignores a paneId that is not a leaf of the tab (same ref)', () => {
    const s = initialState();
    const tabId = s.spaces[0].tabs[0].id;
    expect(setZoom(s, tabId, 'no-such-pane')).toBe(s);
  });
});

describe('focusPane', () => {
  it('sets activePaneId for an existing leaf of the active tab', () => {
    const { state, leafId } = stateWithLeafCwd('');
    const s = splitPane(state, leafId, 'v');
    const [a] = (s.spaces[0].tabs[0].root as Split).children as Leaf[];
    const r = focusPane(s, a.id);
    expect(r.spaces[0].tabs[0].activePaneId).toBe(a.id);
  });

  it('ignores an unknown pane', () => {
    const { state } = stateWithLeafCwd('');
    expect(focusPane(state, 'nope')).toBe(state);
  });
});

import { focusNeighbor } from './reducers';
import type { PaneNode } from './types';

// Wrap a pane tree into a one-space/one-tab AppState focused on `activePaneId`.
function stateWithRoot(root: PaneNode, activePaneId: string): AppState {
  const tab: Tab = { id: 't', title: 'x', activePaneId, zoomedPaneId: null, root };
  const space: Space = { id: 's', name: 's', collapsed: false, activeTabId: 't', tabs: [tab] };
  return { activeSpaceId: 's', spaces: [space] };
}

describe('focusNeighbor', () => {
  it('moves focus to the visual neighbor in the arrow direction', () => {
    const a = newLeaf();
    const b = newLeaf();
    const c = newLeaf();
    const d = newLeaf();
    // 2x2 grid (outer v-split of two h-split columns).
    const root = newSplit('v', [newSplit('h', [a, b]), newSplit('h', [c, d])]);
    const s = stateWithRoot(root, a.id);
    expect(focusNeighbor(s, 'right').spaces[0].tabs[0].activePaneId).toBe(c.id);
    expect(focusNeighbor(s, 'down').spaces[0].tabs[0].activePaneId).toBe(b.id);
  });

  it('is a no-op at an edge (same ref)', () => {
    const a = newLeaf();
    const b = newLeaf();
    const s = stateWithRoot(newSplit('v', [a, b]), a.id);
    expect(focusNeighbor(s, 'left')).toBe(s);
    expect(focusNeighbor(s, 'up')).toBe(s);
  });
});

import { switchSpaceBy } from './reducers';

describe('switchSpaceBy', () => {
  it('moves to the next space', () => {
    let s = addSpace(addSpace(initialState(), 'b'), 'c'); // [space 1, b, c]
    s = setActiveSpace(s, s.spaces[0].id); // active = space 1
    expect(switchSpaceBy(s, 1).activeSpaceId).toBe(s.spaces[1].id);
  });

  it('wraps around both ends', () => {
    let s = addSpace(addSpace(initialState(), 'b'), 'c');
    s = setActiveSpace(s, s.spaces[0].id);
    expect(switchSpaceBy(s, -1).activeSpaceId).toBe(s.spaces[2].id); // first → last
    s = setActiveSpace(s, s.spaces[2].id);
    expect(switchSpaceBy(s, 1).activeSpaceId).toBe(s.spaces[0].id); // last → first
  });

  it('is a no-op with a single space (same ref)', () => {
    const s = initialState();
    expect(switchSpaceBy(s, 1)).toBe(s);
  });
});

describe('setPaneTitle', () => {
  it('sets the title of a leaf in the active tab', () => {
    const s = initialState();
    const paneId = (s.spaces[0].tabs[0].root as Leaf).id;
    const next = setPaneTitle(s, paneId, 'build');
    expect((next.spaces[0].tabs[0].root as TerminalLeaf).title).toBe('build');
  });

  it('returns the same state for an unknown paneId (no-op)', () => {
    const s = initialState();
    expect(setPaneTitle(s, 'no-such-id', 'x')).toBe(s);
  });
});

describe('movePane — edge', () => {
  function twoPaneState() {
    const s0 = initialState();
    const a = s0.spaces[0].tabs[0].root.id;
    const s1 = splitPane(s0, a, 'v'); // Split v [A, B]
    const split = s1.spaces[0].tabs[0].root as any;
    return { s: s1, aId: split.children[0].id as string, bId: split.children[1].id as string };
  }

  it('edge onto the right border of a same-dir sibling — flatten as the sibling on the right (same shape → no-op)', () => {
    // A|B (v). Drag B onto the right border of A → B lands right after A: A|B (same shape) — no-op.
    const { s, aId, bId } = twoPaneState();
    expect(movePane(s, bId, { kind: 'edge', leafId: aId, side: 'right' })).toBe(s);
  });

  it('edge onto the left border of a sibling changes the order (B|A)', () => {
    const { s, aId, bId } = twoPaneState();
    const r = movePane(s, bId, { kind: 'edge', leafId: aId, side: 'left' });
    const split = r.spaces[0].tabs[0].root as any;
    expect(split.kind).toBe('split');
    expect(split.dir).toBe('v');
    expect(split.children.map((c: any) => c.id)).toEqual([bId, aId]);
    expect(r.spaces[0].tabs[0].activePaneId).toBe(bId);
  });

  it('edge of a different axis wraps the target-root in a new split (nesting)', () => {
    // A|B (v). Drag B onto the TOP of A → the root collapses to A, then A is wrapped in h[B, A].
    const { s, aId, bId } = twoPaneState();
    const r = movePane(s, bId, { kind: 'edge', leafId: aId, side: 'top' });
    const root = r.spaces[0].tabs[0].root as any;
    expect(root.kind).toBe('split');
    expect(root.dir).toBe('h');
    expect(root.children.map((c: any) => c.id)).toEqual([bId, aId]);
  });

  it('detach collapses a single-child split of the sibling, then flatten (same axis)', () => {
    // Tree v[A, h[B,C]]. Drag A onto the BOTTOM border of B (B's parent is h, same axis 'h') → flatten.
    const s0 = initialState();
    const a0 = s0.spaces[0].tabs[0].root.id;
    let s = splitPane(s0, a0, 'v');             // v[A, B]
    const v = s.spaces[0].tabs[0].root as any;
    const bId = v.children[1].id;
    s = splitPane(s, bId, 'h');                 // v[A, h[B, C]]
    const v2 = s.spaces[0].tabs[0].root as any;
    const aId = v2.children[0].id;
    const h = v2.children[1] as any;
    const bInner = h.children[0].id;            // B
    const cInner = h.children[1].id;            // C
    const r = movePane(s, aId, { kind: 'edge', leafId: bInner, side: 'bottom' });
    // A removed from the root v[A, h[..]] → the root collapsed to h[B,C]; A merged AFTER B (same axis h):
    const root = r.spaces[0].tabs[0].root as any;
    expect(root.kind).toBe('split');
    expect(root.dir).toBe('h');
    expect(root.children.map((c: any) => c.id)).toEqual([bInner, aId, cInner]); // h[B, A, C]
    const sum = root.ratio.reduce((x: number, y: number) => x + y, 0);
    expect(sum).toBeCloseTo(1, 5);            // the flatten splice ratio yields a correct sum
    expect(root.ratio.length).toBe(3);        // children and ratio aligned by length
  });

  it('edge onto itself — no-op', () => {
    const { s, aId } = twoPaneState();
    expect(movePane(s, aId, { kind: 'edge', leafId: aId, side: 'left' })).toBe(s);
  });

  it('ratio renormalized (sum ~1) after the split', () => {
    const { s, aId, bId } = twoPaneState();
    const r = movePane(s, bId, { kind: 'edge', leafId: aId, side: 'left' });
    const split = r.spaces[0].tabs[0].root as any;
    const sum = split.ratio.reduce((x: number, y: number) => x + y, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('edge into an EQUAL split equalizes the siblings (1/N)', () => {
    // v[ h[A,B]@equal, C ]. Drag C onto the bottom border of A (parent h, same axis) → h[A,C,B] evenly.
    const a = newLeaf(); const b = newLeaf(); const c = newLeaf();
    const h = newSplit('h', [a, b]);            // [.5,.5] equal
    const root0 = newSplit('v', [h, c]);
    const tab: Tab = { id: 't', title: 'x', activePaneId: c.id, zoomedPaneId: null, root: root0 };
    const space: Space = { id: 's', name: 's', collapsed: false, activeTabId: 't', tabs: [tab] };
    const r = movePane({ activeSpaceId: 's', spaces: [space] }, c.id, { kind: 'edge', leafId: a.id, side: 'bottom' });
    const root = r.spaces[0].tabs[0].root as Split;
    expect(root.dir).toBe('h');
    expect(root.children.map((ch) => (ch as Leaf).id)).toEqual([a.id, c.id, b.id]);
    expect(root.ratio[0]).toBeCloseTo(1 / 3, 5);
    expect(root.ratio[1]).toBeCloseTo(1 / 3, 5);
    expect(root.ratio[2]).toBeCloseTo(1 / 3, 5);
  });

  it('edge into an UNEQUAL split preserves proportions (halves the target share)', () => {
    // v[ h[A,B]@[.8,.2], C ]. Drag C onto the bottom border of A → h[A,C,B], unequal → preserve.
    const a = newLeaf(); const b = newLeaf(); const c = newLeaf();
    const h = newSplit('h', [a, b], [0.8, 0.2]);
    const root0 = newSplit('v', [h, c]);
    const tab: Tab = { id: 't', title: 'x', activePaneId: c.id, zoomedPaneId: null, root: root0 };
    const space: Space = { id: 's', name: 's', collapsed: false, activeTabId: 't', tabs: [tab] };
    const r = movePane({ activeSpaceId: 's', spaces: [space] }, c.id, { kind: 'edge', leafId: a.id, side: 'bottom' });
    const root = r.spaces[0].tabs[0].root as Split;
    expect(root.children.map((ch) => (ch as Leaf).id)).toEqual([a.id, c.id, b.id]);
    expect(root.ratio[0]).toBeCloseTo(0.4, 5); // 0.8 halved
    expect(root.ratio[1]).toBeCloseTo(0.4, 5); // C
    expect(root.ratio[2]).toBeCloseTo(0.2, 5); // B preserved
  });
});

describe('movePane — swap', () => {
  // A tab with 2 leaves: splitPane('v') on a single root → Split v [A, B].
  function twoPaneState() {
    const s0 = initialState();
    const a = s0.spaces[0].tabs[0].root.id;
    const s1 = splitPane(s0, a, 'v');
    const split = s1.spaces[0].tabs[0].root as any; // Split [A, B]
    return { s: s1, aId: split.children[0].id as string, bId: split.children[1].id as string };
  }

  it('swap exchanges two leaves and makes the dragged one active', () => {
    const { s, aId, bId } = twoPaneState();
    const r = movePane(s, aId, { kind: 'swap', leafId: bId });
    const split = r.spaces[0].tabs[0].root as any;
    expect(split.children[0].id).toBe(bId);
    expect(split.children[1].id).toBe(aId);
    expect(r.spaces[0].tabs[0].activePaneId).toBe(aId);
  });

  it('swap onto itself — no-op (same ref)', () => {
    const { s, aId } = twoPaneState();
    expect(movePane(s, aId, { kind: 'swap', leafId: aId })).toBe(s);
  });

  it('unknown dragId — no-op', () => {
    const { s, bId } = twoPaneState();
    expect(movePane(s, 'nope', { kind: 'swap', leafId: bId })).toBe(s);
  });

  it('a tab with a single pane — no-op (nothing to rearrange)', () => {
    const s = initialState();
    const only = s.spaces[0].tabs[0].root.id;
    expect(movePane(s, only, { kind: 'swap', leafId: only })).toBe(s);
  });

  it('swap resets zoom', () => {
    const { s, aId, bId } = twoPaneState();
    const tabId = s.spaces[0].tabs[0].id;
    const zoomed = { ...s, spaces: s.spaces.map((sp) => ({
      ...sp, tabs: sp.tabs.map((t) => t.id === tabId ? { ...t, zoomedPaneId: aId } : t),
    })) };
    const r = movePane(zoomed, aId, { kind: 'swap', leafId: bId });
    expect(r.spaces[0].tabs[0].zoomedPaneId).toBeNull();
  });
});

describe('movePane — outer (perimeter)', () => {
  function twoPaneState() {
    const s0 = initialState();
    const a = s0.spaces[0].tabs[0].root.id;
    const s1 = splitPane(s0, a, 'v');
    const split = s1.spaces[0].tabs[0].root as any;
    return { s: s1, aId: split.children[0].id as string, bId: split.children[1].id as string };
  }

  it('outer top wraps the root in a new h-split, the dragged one on top', () => {
    // A|B (v). Drag B onto the top perimeter → the root collapses to A, wrapped in h[B, A].
    const { s, aId, bId } = twoPaneState();
    const r = movePane(s, bId, { kind: 'outer', side: 'top' });
    const root = r.spaces[0].tabs[0].root as any;
    expect(root.kind).toBe('split');
    expect(root.dir).toBe('h');
    expect(root.children[0].id).toBe(bId);   // the dragged one on top (before)
    expect(root.children[1].id).toBe(aId);
    expect(r.spaces[0].tabs[0].activePaneId).toBe(bId);
  });

  it('outer right of the same dir as the root → flatten into the root split', () => {
    // v[A,B,C]. Drag A onto the right perimeter (dir v == root) → flatten: [B, C, A].
    const s0 = initialState();
    const a0 = s0.spaces[0].tabs[0].root.id;
    let s = splitPane(s0, a0, 'v');               // v[A, B]
    let v = s.spaces[0].tabs[0].root as any;
    s = splitPane(s, v.children[1].id, 'v');      // v[A, B, C] (same-dir flatten)
    v = s.spaces[0].tabs[0].root as any;
    expect(v.children.length).toBe(3);            // splitPane same-dir flatten → 3 leaves, no nesting
    const aId = v.children[0].id;
    const r = movePane(s, aId, { kind: 'outer', side: 'right' });
    const root = r.spaces[0].tabs[0].root as any;
    expect(root.dir).toBe('v');
    const ids = root.children.map((c: any) => c.id);
    expect(ids[ids.length - 1]).toBe(aId);        // A to the very end on the right
    expect(root.children).toHaveLength(3);        // no extra nesting
    expect(root.ratio.reduce((x: number, y: number) => x + y, 0)).toBeCloseTo(1, 5);
  });

  it('outer cross-dir wraps the whole non-collapsed split', () => {
    // v[A,B,C]. Drag A onto the top perimeter (dir h ≠ root v) → h[A, v[B,C]].
    const s0 = initialState();
    const a0 = s0.spaces[0].tabs[0].root.id;
    let s = splitPane(s0, a0, 'v');               // v[A, B]
    let v = s.spaces[0].tabs[0].root as any;
    s = splitPane(s, v.children[1].id, 'v');      // v[A, B, C]
    v = s.spaces[0].tabs[0].root as any;
    const aId = v.children[0].id;
    const bId = v.children[1].id;
    const cId = v.children[2].id;
    const r = movePane(s, aId, { kind: 'outer', side: 'top' });
    const root = r.spaces[0].tabs[0].root as any;
    expect(root.dir).toBe('h');
    expect(root.children[0].id).toBe(aId);        // the dragged one on top
    const inner = root.children[1];
    expect(inner.kind).toBe('split');
    expect(inner.dir).toBe('v');
    expect(inner.children.map((c: any) => c.id)).toEqual([bId, cId]); // the remaining v[B,C]
  });

  it('outer on the tab\'s only pane — no-op (root-leaf)', () => {
    const s = initialState();
    const only = s.spaces[0].tabs[0].root.id;
    expect(movePane(s, only, { kind: 'outer', side: 'left' })).toBe(s);
  });

  it('outer into an EQUAL root split equalizes (1/N)', () => {
    // v[A,B,C]@equal. Drag A onto the right perimeter (dir v == root) → flatten [B,C,A] evenly.
    const a = newLeaf(); const b = newLeaf(); const c = newLeaf();
    const v = newSplit('v', [a, b, c]);          // equal
    const tab: Tab = { id: 't', title: 'x', activePaneId: a.id, zoomedPaneId: null, root: v };
    const space: Space = { id: 's', name: 's', collapsed: false, activeTabId: 't', tabs: [tab] };
    const r = movePane({ activeSpaceId: 's', spaces: [space] }, a.id, { kind: 'outer', side: 'right' });
    const root = r.spaces[0].tabs[0].root as Split;
    expect(root.children.map((ch) => (ch as Leaf).id)).toEqual([b.id, c.id, a.id]);
    expect(root.ratio.every((x) => Math.abs(x - 1 / 3) < 1e-6)).toBe(true);
  });

  it('outer into an UNEQUAL root split does NOT equalize (preserves inequality)', () => {
    // v[A,B,h[C,D]]@[.6,.3,.1]. Drag C (inside h) onto the right perimeter.
    // detach C → h collapses to D, root v[A,B,D]@[.6,.3,.1] (unequal); insertOuter → does not equalize.
    const a = newLeaf(); const b = newLeaf(); const c = newLeaf(); const d = newLeaf();
    const h = newSplit('h', [c, d]);
    const v = newSplit('v', [a, b, h], [0.6, 0.3, 0.1]);
    const tab: Tab = { id: 't', title: 'x', activePaneId: c.id, zoomedPaneId: null, root: v };
    const space: Space = { id: 's', name: 's', collapsed: false, activeTabId: 't', tabs: [tab] };
    const r = movePane({ activeSpaceId: 's', spaces: [space] }, c.id, { kind: 'outer', side: 'right' });
    const root = r.spaces[0].tabs[0].root as Split;
    expect(root.children).toHaveLength(4);
    expect((root.children[3] as Leaf).id).toBe(c.id); // C to the end
    const eq = Math.max(...root.ratio) - Math.min(...root.ratio) < 1e-6;
    expect(eq).toBe(false); // NOT equalized (inequality preserved)
  });
});

describe('movePane — divider', () => {
  // v[A, B, C] (three leaves in one split).
  function threePaneState() {
    const s0 = initialState();
    const a0 = s0.spaces[0].tabs[0].root.id;
    let s = splitPane(s0, a0, 'v');
    let v = s.spaces[0].tabs[0].root as any;
    s = splitPane(s, v.children[1].id, 'v'); // v[A, B, C]
    v = s.spaces[0].tabs[0].root as any;
    return {
      s, splitId: v.id as string,
      aId: v.children[0].id as string,
      bId: v.children[1].id as string,
      cId: v.children[2].id as string,
    };
  }

  it('divider inserts moving into the split at the index (between B and C)', () => {
    // Tree h[ v[A,A2,A3], OUT ]. Drag OUT onto the divider between A2 and A3 (index 2).
    // detach OUT collapses the h-root into the v-split; OUT is inserted inside at index 2.
    const s0 = initialState();
    const a0 = s0.spaces[0].tabs[0].root.id;
    let s = splitPane(s0, a0, 'h');           // h[A, OUT]
    let h = s.spaces[0].tabs[0].root as any;
    const outId = h.children[1].id as string;
    s = splitPane(s, h.children[0].id, 'v');  // h[ v[A, A2], OUT ]
    h = s.spaces[0].tabs[0].root as any;
    const v = h.children[0] as any;
    s = splitPane(s, v.children[1].id, 'v');  // h[ v[A, A2, A3], OUT ]
    h = s.spaces[0].tabs[0].root as any;
    const vSplit = h.children[0] as any;
    const splitId = vSplit.id as string;
    const aId = vSplit.children[0].id as string;
    const bId = vSplit.children[1].id as string; // A2
    const cId = vSplit.children[2].id as string; // A3
    const r = movePane(s, outId, { kind: 'divider', splitId, index: 2 });
    const root = r.spaces[0].tabs[0].root as any; // h collapsed into v
    expect(root.kind).toBe('split');
    expect(root.dir).toBe('v');
    expect(root.children.map((c: any) => c.id)).toEqual([aId, bId, outId, cId]); // v[A, A2, OUT, A3]
    expect(r.spaces[0].tabs[0].activePaneId).toBe(outId);
  });

  it('the index shifts when the dragged one was a child of the same split to the left', () => {
    // v[A, B, C]. Drag A onto the divider between B and C (index 2). detach A → [B,C]; A<2 → adj=1.
    const { s, splitId, aId, bId, cId } = threePaneState();
    const r = movePane(s, aId, { kind: 'divider', splitId, index: 2 });
    const root = r.spaces[0].tabs[0].root as any;
    expect(root.children.map((c: any) => c.id)).toEqual([bId, aId, cId]); // A between B and C
  });

  it('the dragged one to the right of the divider — no index shift', () => {
    // v[A, B, C]. Drag C (p=2) onto the divider between A and B (index 1). p>index → no shift → [A, C, B].
    const { s, splitId, aId, bId, cId } = threePaneState();
    const r = movePane(s, cId, { kind: 'divider', splitId, index: 1 });
    const root = r.spaces[0].tabs[0].root as any;
    expect(root.children.map((c: any) => c.id)).toEqual([aId, cId, bId]);
  });

  it('a divider of a collapsed split — no-op', () => {
    // v[A, B]. Drag A onto the "divider" (index 1). detach A → the root collapsed to B, splitId gone → no-op.
    const s0 = initialState();
    const a0 = s0.spaces[0].tabs[0].root.id;
    const s = splitPane(s0, a0, 'v');
    const v = s.spaces[0].tabs[0].root as any;
    const r = movePane(s, v.children[0].id, { kind: 'divider', splitId: v.id, index: 1 });
    expect(r).toBe(s);
  });

  it('divider into an EQUAL split equalizes (1/N)', () => {
    // h[ v[A,B,C]@equal, OUT ]. Drag OUT onto the divider of v at index 1 → v[A,OUT,B,C] evenly.
    const a = newLeaf(); const b = newLeaf(); const c = newLeaf(); const out = newLeaf();
    const v = newSplit('v', [a, b, c]);          // equal [⅓,⅓,⅓]
    const root0 = newSplit('h', [v, out]);
    const tab: Tab = { id: 't', title: 'x', activePaneId: out.id, zoomedPaneId: null, root: root0 };
    const space: Space = { id: 's', name: 's', collapsed: false, activeTabId: 't', tabs: [tab] };
    const r = movePane({ activeSpaceId: 's', spaces: [space] }, out.id, { kind: 'divider', splitId: v.id, index: 1 });
    const root = r.spaces[0].tabs[0].root as Split; // h collapsed into v
    expect(root.id).toBe(v.id);
    expect(root.children.map((ch) => (ch as Leaf).id)).toEqual([a.id, out.id, b.id, c.id]);
    expect(root.ratio.every((x) => Math.abs(x - 1 / 4) < 1e-6)).toBe(true); // all at 1/4
  });

  it('divider into an UNEQUAL split does NOT equalize', () => {
    // h[ v[A,B,C]@[.6,.3,.1], OUT ]. Drag OUT onto the divider of v at index 1 → does not equalize.
    const a = newLeaf(); const b = newLeaf(); const c = newLeaf(); const out = newLeaf();
    const v = newSplit('v', [a, b, c], [0.6, 0.3, 0.1]);
    const root0 = newSplit('h', [v, out]);
    const tab: Tab = { id: 't', title: 'x', activePaneId: out.id, zoomedPaneId: null, root: root0 };
    const space: Space = { id: 's', name: 's', collapsed: false, activeTabId: 't', tabs: [tab] };
    const r = movePane({ activeSpaceId: 's', spaces: [space] }, out.id, { kind: 'divider', splitId: v.id, index: 1 });
    const root = r.spaces[0].tabs[0].root as Split;
    expect(root.children).toHaveLength(4);
    const eq = Math.max(...root.ratio) - Math.min(...root.ratio) < 1e-6;
    expect(eq).toBe(false);
  });
});

import { toggleSidebar, setSidebarWidth, toggleBottomPanel, setBottomPanelHeight } from './reducers';
import { SIDEBAR_MIN, SIDEBAR_MAX, SIDEBAR_DEFAULT } from './sidebar';
import { BOTTOM_PANEL_MIN, BOTTOM_PANEL_MAX, BOTTOM_PANEL_DEFAULT } from './bottomPanel';

describe('toggleSidebar', () => {
  it('toggles collapsed and is reversible', () => {
    const s0 = initialState();
    const s1 = toggleSidebar(s0);
    expect(s1.ui?.sidebarCollapsed).toBe(true);
    expect(toggleSidebar(s1).ui?.sidebarCollapsed).toBe(false);
  });
  it('creates ui with defaults when it did not exist', () => {
    const s0 = { ...initialState(), ui: undefined };
    const s1 = toggleSidebar(s0);
    expect(s1.ui).toMatchObject({ sidebarCollapsed: true, sidebarWidth: SIDEBAR_DEFAULT, alertColor: DEFAULT_ALERT_COLOR });
  });
  it('does not mutate the input', () => {
    const s0 = initialState();
    const before = s0.ui?.sidebarCollapsed;
    toggleSidebar(s0);
    expect(s0.ui?.sidebarCollapsed).toBe(before);
  });
});

describe('setSidebarWidth', () => {
  it('clamps the width to the range', () => {
    expect(setSidebarWidth(initialState(), 50).ui?.sidebarWidth).toBe(SIDEBAR_MIN);
    expect(setSidebarWidth(initialState(), 9999).ui?.sidebarWidth).toBe(SIDEBAR_MAX);
    expect(setSidebarWidth(initialState(), 300).ui?.sidebarWidth).toBe(300);
  });
  it('preserves collapsed when the width changes', () => {
    const collapsed = toggleSidebar(initialState());
    expect(setSidebarWidth(collapsed, 300).ui?.sidebarCollapsed).toBe(true);
  });
  it('creates ui with defaults when it did not exist', () => {
    const s = setSidebarWidth({ ...initialState(), ui: undefined }, 300);
    expect(s.ui).toMatchObject({ sidebarCollapsed: false, sidebarWidth: 300, alertColor: DEFAULT_ALERT_COLOR });
  });
});

import { gridConsoles } from './reducers';
import { collectLeaves, findLeaf } from './selectors';

describe('gridConsoles', () => {
  it('turns 1 console into 2×2 (4 leaves), the existing paneId is kept, zoom reset', () => {
    const s0 = initialState();
    const origId = (s0.spaces[0].tabs[0].root as { id: string }).id;
    const s1 = gridConsoles(s0, 2, 2);
    const tab1 = s1.spaces[0].tabs[0];
    const leaves = collectLeaves(tab1.root);
    expect(leaves).toHaveLength(4);
    expect(leaves.map((l) => l.id)).toContain(origId);
    expect(tab1.zoomedPaneId).toBeNull();
  });
  it('the first new console becomes active', () => {
    const s0 = initialState();
    const origId = (s0.spaces[0].tabs[0].root as { id: string }).id;
    const tab1 = gridConsoles(s0, 2, 2).spaces[0].tabs[0];
    expect(tab1.activePaneId).not.toBe(origId);
    expect(collectLeaves(tab1.root).some((l) => l.id === tab1.activePaneId)).toBe(true);
  });
  it('clamps the dimensions (6×6 → 12 consoles)', () => {
    const s1 = gridConsoles(initialState(), 6, 6);
    expect(collectLeaves(s1.spaces[0].tabs[0].root)).toHaveLength(12);
  });
  it('no-op (same ref) when already ≥ target', () => {
    const s1 = gridConsoles(initialState(), 2, 2); // 4 consoles
    const s2 = gridConsoles(s1, 1, 1);             // target 1 ≤ 4
    expect(s2).toBe(s1);
  });
  it('does not mutate the input', () => {
    const s0 = initialState();
    const snap = JSON.stringify(s0);
    gridConsoles(s0, 2, 2);
    expect(JSON.stringify(s0)).toBe(snap);
  });
  it('preserves several existing consoles (sessions) when the grid grows', () => {
    const s4 = gridConsoles(initialState(), 2, 2); // 4 consoles
    const ids4 = collectLeaves(s4.spaces[0].tabs[0].root).map((l) => l.id);
    const s6 = gridConsoles(s4, 6, 1); // target 6 > 4 → add 2 new
    const ids6 = collectLeaves(s6.spaces[0].tabs[0].root).map((l) => l.id);
    expect(ids6).toHaveLength(6);
    for (const id of ids4) expect(ids6).toContain(id); // all 4 sessions alive
  });
});

import { moveTab } from './reducers';
import { addTab as addTabR } from './reducers';

import {
  setAlertColor,
  setActiveColor, setExitColor, setUiFont, setUiFontSize, resetAppearance,
} from './reducers';
import { DEFAULT_ALERT_COLOR } from './alertColors';

describe('setAlertColor', () => {
  it('writes ui.alertColor', () => {
    expect(setAlertColor(initialState(), 'magenta').ui?.alertColor).toBe('magenta');
  });
  it('preserves sidebar fields', () => {
    const s = setAlertColor(initialState(), 'purple');
    expect(s.ui?.sidebarWidth).toBe(initialState().ui?.sidebarWidth);
    expect(s.ui?.sidebarCollapsed).toBe(false);
  });
  it('does not mutate the input', () => {
    const s0 = initialState();
    const snap = JSON.stringify(s0);
    setAlertColor(s0, 'green');
    expect(JSON.stringify(s0)).toBe(snap);
  });
  it('initialState seeds the default alertColor', () => {
    expect(initialState().ui?.alertColor).toBe(DEFAULT_ALERT_COLOR);
  });
});

describe('moveTab', () => {
  // Utility: a space with N tabs. Returns {state, spaceId, tabIds}.
  function spaceWithTabs(n: number, name: string, base = initialState()) {
    // initialState gives 1 space with 1 tab; for the rest we create via addSpace.
    let s = name === 'space 1' ? base : addSpace(base, name);
    const sp = s.spaces.find((x) => x.name === name)!;
    let cur = s;
    for (let i = 1; i < n; i++) cur = addTabR(cur, sp.id, `${name}-t${i + 1}`);
    const space = cur.spaces.find((x) => x.id === sp.id)!;
    return { state: cur, spaceId: space.id, tabIds: space.tabs.map((t) => t.id) };
  }

  it('intra-space: reorders a tab and makes it active', () => {
    const { state, spaceId, tabIds } = spaceWithTabs(3, 'space 1'); // [t0, t1, t2]
    // move t0 to the end (post-removal array [t1,t2], insert at index=2)
    const s = moveTab(state, tabIds[0], spaceId, 2);
    const sp = s.spaces.find((x) => x.id === spaceId)!;
    expect(sp.tabs.map((t) => t.id)).toEqual([tabIds[1], tabIds[2], tabIds[0]]);
    expect(sp.activeTabId).toBe(tabIds[0]);
    expect(s.activeSpaceId).toBe(spaceId);
  });

  it('intra-space: insert at the start', () => {
    const { state, spaceId, tabIds } = spaceWithTabs(3, 'space 1');
    const s = moveTab(state, tabIds[2], spaceId, 0); // post-removal [t0,t1], index 0
    const sp = s.spaces.find((x) => x.id === spaceId)!;
    expect(sp.tabs.map((t) => t.id)).toEqual([tabIds[2], tabIds[0], tabIds[1]]);
    expect(sp.activeTabId).toBe(tabIds[2]); // the moved tab becomes active
  });

  it('intra-space: drop into its own slot with the tab active — no-op (same ref)', () => {
    const { state, spaceId, tabIds } = spaceWithTabs(3, 'space 1');
    // make t0 active (addTab made the last one — t2 — active); activate t0
    const active = setActiveTab(state, spaceId, tabIds[0]);
    // post-removal [t1,t2]; insert at index 0 → [t0,t1,t2] == the original order
    expect(moveTab(active, tabIds[0], spaceId, 0)).toBe(active);
  });

  it('inter-space: moves a tab into the target space at a position, makes them active', () => {
    const a = spaceWithTabs(2, 'space 1');            // A: [a0, a1]
    const withB = spaceWithTabs(2, 'B', a.state);     // B: [b0, b1]
    const b = withB.spaceId;
    const bTabs = withB.tabIds;
    const s = moveTab(withB.state, a.tabIds[0], b, 1); // insert a0 into B at index 1
    const spA = s.spaces.find((x) => x.id === a.spaceId)!;
    const spB = s.spaces.find((x) => x.id === b)!;
    expect(spA.tabs.map((t) => t.id)).toEqual([a.tabIds[1]]); // a0 left
    expect(spB.tabs.map((t) => t.id)).toEqual([bTabs[0], a.tabIds[0], bTabs[1]]);
    expect(s.activeSpaceId).toBe(b);
    expect(spB.activeTabId).toBe(a.tabIds[0]);
  });

  it('inter-space: toIndex=length → appends to the end of the target', () => {
    const a = spaceWithTabs(2, 'space 1');
    const withB = spaceWithTabs(2, 'B', a.state);
    const s = moveTab(withB.state, a.tabIds[0], withB.spaceId, withB.tabIds.length);
    const spB = s.spaces.find((x) => x.id === withB.spaceId)!;
    expect(spB.tabs.map((t) => t.id)).toEqual([...withB.tabIds, a.tabIds[0]]);
  });

  it('inter-space: a large toIndex is clamped to the end', () => {
    const a = spaceWithTabs(2, 'space 1');
    const withB = spaceWithTabs(2, 'B', a.state);
    const s = moveTab(withB.state, a.tabIds[0], withB.spaceId, 999);
    const spB = s.spaces.find((x) => x.id === withB.spaceId)!;
    expect(spB.tabs[spB.tabs.length - 1].id).toBe(a.tabIds[0]);
  });

  it('inter-space: an emptied source space closes (one-tab-space rule)', () => {
    const a = spaceWithTabs(1, 'space 1');            // solo A: [a0]
    const withB = spaceWithTabs(2, 'B', a.state);     // B: [b0, b1]
    const s = moveTab(withB.state, a.tabIds[0], withB.spaceId, 0);
    expect(s.spaces.find((x) => x.id === a.spaceId)).toBeUndefined(); // A closed
    const spB = s.spaces.find((x) => x.id === withB.spaceId)!;
    expect(spB.tabs.map((t) => t.id)).toEqual([a.tabIds[0], ...withB.tabIds]);
    expect(s.activeSpaceId).toBe(withB.spaceId);
  });

  it('inter-space: the source (survivor) reassigns the active tab if the active one was taken', () => {
    const a = spaceWithTabs(3, 'space 1');            // A: [a0,a1,a2], a2 active (the last added)
    const withB = spaceWithTabs(1, 'B', a.state);
    const s = moveTab(withB.state, a.tabIds[2], withB.spaceId, 0); // took the active a2
    const spA = s.spaces.find((x) => x.id === a.spaceId)!;
    expect(spA.tabs.map((t) => t.id)).toEqual([a.tabIds[0], a.tabIds[1]]);
    expect(spA.activeTabId).toBe(a.tabIds[1]); // the previous one (max(0, idx-1))
  });

  it('unknown tabId → no-op (same ref)', () => {
    const { state, spaceId } = spaceWithTabs(2, 'space 1');
    expect(moveTab(state, 'nope', spaceId, 0)).toBe(state);
  });

  it('unknown toSpaceId → no-op (same ref)', () => {
    const { state, tabIds } = spaceWithTabs(2, 'space 1');
    expect(moveTab(state, tabIds[0], 'nope', 0)).toBe(state);
  });
});

describe('appearance reducers', () => {
  it('setActiveColor writes ui.activeColor immutably', () => {
    const s = initialState();
    const n = setActiveColor(s, '#112233');
    expect(n.ui?.activeColor).toBe('#112233');
    expect(n).not.toBe(s);
    expect(s.ui?.activeColor).not.toBe('#112233'); // source is not mutated
  });
  it('setExitColor writes ui.exitColor without touching activeColor', () => {
    const s = setActiveColor(initialState(), 'green');
    const n = setExitColor(s, 'red');
    expect(n.ui?.exitColor).toBe('red');
    expect(n.ui?.activeColor).toBe('green');
  });
  it('setUiFont writes ui.uiFont', () => {
    const n = setUiFont(initialState(), 'serif');
    expect(n.ui?.uiFont).toBe('serif');
  });
  it('setUiFontSize clamps the value', () => {
    expect(setUiFontSize(initialState(), 99).ui?.uiFontSize).toBe(24);
    expect(setUiFontSize(initialState(), 2).ui?.uiFontSize).toBe(9);
    expect(setUiFontSize(initialState(), 16).ui?.uiFontSize).toBe(16);
  });
  it('resetAppearance returns all 5 settings to defaults', () => {
    let s = setActiveColor(initialState(), '#111111');
    s = setExitColor(s, '#222222');
    s = setUiFont(s, 'chalk');
    s = setUiFontSize(s, 22);
    const n = resetAppearance(s);
    expect(n.ui?.activeColor).toBe('orange');
    expect(n.ui?.exitColor).toBe('red');
    expect(n.ui?.alertColor).toBe('cyan');
    expect(n.ui?.uiFont).toBe('jetbrains');
    expect(n.ui?.uiFontSize).toBe(13);
  });
  it('resetAppearance preserves sidebar fields', () => {
    const s = setSidebarWidth(toggleSidebar(initialState()), 300);
    const n = resetAppearance(s);
    expect(n.ui?.sidebarWidth).toBe(300);
    expect(n.ui?.sidebarCollapsed).toBe(true);
  });
});

describe('moveLeafToNav', () => {
  // Source: space1 with an active 2-pane tab Split[A,B]; + space2 (1 tab, 1 console).
  function setup() {
    let s = initialState();
    const srcTabId = s.spaces[0].tabs[0].id;
    const a = (s.spaces[0].tabs[0].root as any).id as string;
    s = splitPane(s, a, 'v');                       // active tab of space1 = Split[A,B]
    const split = s.spaces[0].tabs[0].root as any;
    const aId = split.children[0].id as string;
    const bId = split.children[1].id as string;
    s = addSpace(s, 'two');                          // space2 (becomes active)
    const space2Id = s.spaces[1].id;
    const tab2Id = s.spaces[1].tabs[0].id;
    s = setActiveSpace(s, s.spaces[0].id);           // source = active tab -> return focus to space1
    return { s, space1Id: s.spaces[0].id, srcTabId, aId, bId, space2Id, tab2Id };
  }
  function countLeaves(s: AppState): number {
    return s.spaces.reduce((n, sp) => n + sp.tabs.reduce((m, t) => m + collectLeaves(t.root).length, 0), 0);
  }
  function findLeafGlobal(s: AppState, id: string) {
    for (const sp of s.spaces) for (const t of sp.tabs) { const f = findLeaf(t.root, id); if (f) return f; }
    return null;
  }

  it('drop onto another space\'s tab -> console merges on the right, follow to target', () => {
    const { s, aId, space2Id, tab2Id } = setup();
    const r = moveLeafToNav(s, aId, { kind: 'tab', spaceId: space2Id, tabId: tab2Id });
    expect(r.spaces[0].tabs[0].root.kind).toBe('terminal');           // source collapsed into lone B
    const tgt = r.spaces[1].tabs[0].root as any;
    expect(tgt.kind).toBe('split');
    expect(tgt.children.map((c: any) => c.id)).toContain(aId);        // A merged into target
    expect(r.activeSpaceId).toBe(space2Id);                           // follow
    expect(r.spaces[1].tabs[0].activePaneId).toBe(aId);
  });

  it('drop onto a grid tab -> retile into an equal grid, not a 50/50 wrapper (bug #1)', () => {
    const base = setup();
    let s = base.s;
    s = setActiveSpace(s, base.space2Id);   // gridConsoles targets the active tab
    s = gridConsoles(s, 2, 2);              // tab2 (space2) = 2x2 grid (4 consoles)
    s = setActiveSpace(s, base.space1Id);   // source active again
    const r = moveLeafToNav(s, base.aId, { kind: 'tab', spaceId: base.space2Id, tabId: base.tab2Id });

    const tgt = r.spaces[1].tabs[0].root as Split;
    const ids = collectLeaves(tgt).map((l) => l.id);
    expect(ids).toHaveLength(5);            // 4 existed + 1 brought in
    expect(ids).toContain(base.aId);

    // the brought-in console does NOT take half (the bug gave exactly 0.5: wrapper [grid | A])
    function leafArea(node: PaneNode, id: string): number {
      if (node.kind === 'terminal') return node.id === id ? 1 : 0;
      const split = node as Split;
      for (let i = 0; i < split.children.length; i++) {
        const sub = leafArea(split.children[i], id);
        if (sub > 0) return sub * split.ratio[i];
      }
      return 0;
    }
    expect(leafArea(tgt, base.aId)).toBeLessThan(0.5);

    // balanced grid of 5 -> 3x2: root is 'h' of two rows
    expect(tgt.dir).toBe('h');
    expect(tgt.children).toHaveLength(2);

    expect(r.spaces[1].tabs[0].activePaneId).toBe(base.aId);
    expect(r.spaces[1].tabs[0].zoomedPaneId).toBeNull();
  });

  it('§9: the moved Leaf keeps the same id; total leaf count is unchanged', () => {
    const { s, aId, space2Id, tab2Id } = setup();
    const before = countLeaves(s);
    const r = moveLeafToNav(s, aId, { kind: 'tab', spaceId: space2Id, tabId: tab2Id });
    expect(countLeaves(r)).toBe(before);                              // took 1 away, added 1
    expect(findLeafGlobal(r, aId)).toBeTruthy();                      // the same paneId is alive
  });

  it('drop onto a space -> new tab at the end, follow', () => {
    const { s, aId, space2Id } = setup();
    const r = moveLeafToNav(s, aId, { kind: 'space', spaceId: space2Id });
    const space2 = r.spaces[1];
    expect(space2.tabs).toHaveLength(2);                             // was 1 -> became 2
    const newTab = space2.tabs[1];
    expect(newTab.root.kind).toBe('terminal');
    expect((newTab.root as any).id).toBe(aId);
    expect(r.activeSpaceId).toBe(space2Id);
    expect(space2.activeTabId).toBe(newTab.id);
  });

  it('detach a tab\'s solo console -> the source tab closes', () => {
    let s = initialState();
    s = addTab(s, s.spaces[0].id);                                   // space1: [tab1(solo), tab2(solo)], active=tab2
    s = addSpace(s, 'two');
    const space2Id = s.spaces[1].id;
    const tab2Id = s.spaces[1].tabs[0].id;
    s = setActiveSpace(s, s.spaces[0].id);                           // active space space1, active tab tab2
    const srcTab = s.spaces[0].tabs.find((t) => t.id === s.spaces[0].activeTabId)!;
    const soloId = (srcTab.root as any).id as string;
    const r = moveLeafToNav(s, soloId, { kind: 'tab', spaceId: space2Id, tabId: tab2Id });
    expect(r.spaces[0].tabs).toHaveLength(1);                        // one of the two tabs closed
    expect((r.spaces[1].tabs[0].root as any).kind).toBe('split');    // target received the merge
    expect(r.activeSpaceId).toBe(space2Id);
  });

  it('detach from a split fixes activePaneId and resets zoom on the removed one', () => {
    const { s, aId, bId, srcTabId, space2Id, tab2Id } = setup();
    const zoomed: AppState = { ...s, spaces: s.spaces.map((sp) =>
      sp.id === s.activeSpaceId
        ? { ...sp, tabs: sp.tabs.map((t) => t.id === srcTabId ? { ...t, activePaneId: aId, zoomedPaneId: aId } : t) }
        : sp) };
    const r = moveLeafToNav(zoomed, aId, { kind: 'tab', spaceId: space2Id, tabId: tab2Id });
    const srcTab = r.spaces[0].tabs[0];
    expect(srcTab.zoomedPaneId).toBeNull();                          // removed the zoomed one -> zoom reset
    expect(srcTab.activePaneId).toBe(bId);                           // active re-pointed to the neighbor
  });

  it('unknown dragId -> no-op (same ref)', () => {
    const { s, space2Id, tab2Id } = setup();
    expect(moveLeafToNav(s, 'nope', { kind: 'tab', spaceId: space2Id, tabId: tab2Id })).toBe(s);
  });

  it('unknown target space -> no-op', () => {
    const { s, aId } = setup();
    expect(moveLeafToNav(s, aId, { kind: 'space', spaceId: 'nope' })).toBe(s);
  });

  it('drop onto its own tab -> no-op', () => {
    const { s, aId, space1Id, srcTabId } = setup();
    expect(moveLeafToNav(s, aId, { kind: 'tab', spaceId: space1Id, tabId: srcTabId })).toBe(s);
  });

  it('edge: solo console onto its own space -> no-op', () => {
    const s = initialState();                                        // space1: 1 tab, 1 console
    const soloId = (s.spaces[0].tabs[0].root as any).id as string;
    const space1Id = s.spaces[0].id;
    expect(moveLeafToNav(s, soloId, { kind: 'space', spaceId: space1Id })).toBe(s);
  });

  it('positive: extract a pane from a 2-pane tab into a new tab of the SAME space', () => {
    const s0 = initialState();
    const a = (s0.spaces[0].tabs[0].root as any).id as string;
    const s = splitPane(s0, a, 'v');                                 // space1: 1 tab = Split[A,B]
    const split = s.spaces[0].tabs[0].root as any;
    const aId = split.children[0].id as string;
    const space1Id = s.spaces[0].id;
    const r = moveLeafToNav(s, aId, { kind: 'space', spaceId: space1Id });
    expect(r.spaces[0].tabs).toHaveLength(2);                        // source (lone B) + new (A)
    expect(r.activeSpaceId).toBe(space1Id);
  });

  it('detach a solo console of a space\'s last tab -> the source space closes (removeSpace cascade)', () => {
    let s = initialState();                 // space1: 1 tab (solo console)
    s = addSpace(s, 'two');                 // space2 (becomes active)
    const space2Id = s.spaces[1].id;
    s = setActiveSpace(s, s.spaces[0].id);  // active = space1 (single-tab solo)
    const soloId = (s.spaces[0].tabs[0].root as any).id as string;
    const r = moveLeafToNav(s, soloId, { kind: 'space', spaceId: space2Id });
    expect(r.spaces).toHaveLength(1);                 // space1 gone (removeSpace cascade)
    expect(r.spaces[0].id).toBe(space2Id);
    expect(r.activeSpaceId).toBe(space2Id);           // follow
    expect(r.spaces[0].tabs).toHaveLength(2);         // space2: was 1 tab -> +new one with the moved console
  });
});

// --- helpers for editor-leaf tests ---
function editorStateWithRoot(root: PaneNode): AppState {
  const s = initialState();
  const leaf = collectLeaves(root)[0];
  s.spaces[0].tabs[0].root = root;
  s.spaces[0].tabs[0].activePaneId = root.kind === 'split' ? leaf.id : root.id;
  return s;
}
function editorActiveRoot(s: AppState): PaneNode {
  const sp = s.spaces.find((x) => x.id === s.activeSpaceId)!;
  const tab = sp.tabs.find((t) => t.id === sp.activeTabId)!;
  return tab.root;
}
function activeTabOf(s: AppState): Tab {
  const sp = s.spaces.find((x) => x.id === s.activeSpaceId)!;
  return sp.tabs.find((t) => t.id === sp.activeTabId)!;
}

describe('reducers with editor leaves', () => {
  it('splitPane on an editor pane adds a terminal and keeps the editor', () => {
    const e = newEditorLeaf('/x.md');
    const s = editorStateWithRoot(e);
    const next = splitPane(s, e.id, 'v');
    const leaves = collectLeaves(editorActiveRoot(next));
    expect(leaves.some((l) => l.kind === 'editor' && l.id === e.id)).toBe(true);
    expect(leaves.some((l) => l.kind === 'terminal')).toBe(true);
  });

  it('movePane swaps an editor leaf preserving kind and files', () => {
    const e = newEditorLeaf('/x.md');
    const t = newLeaf('/a');
    const s = editorStateWithRoot(newSplit('v', [t, e]));
    const next = movePane(s, e.id, { kind: 'swap', leafId: t.id });
    const moved = findLeaf(editorActiveRoot(next), e.id) as EditorLeaf;
    expect(moved?.kind).toBe('editor');
    expect(moved.files[0].path).toBe('/x.md');
  });

  it('setPaneTitle does not add a title to an editor leaf', () => {
    const e = newEditorLeaf('/x.md');
    const s = editorStateWithRoot(newSplit('v', [newLeaf('/a'), e]));
    const next = setPaneTitle(s, e.id, 'nope');
    const leaf = findLeaf(editorActiveRoot(next), e.id) as any;
    expect(leaf.title).toBeUndefined();
  });
});

describe('openFileInPane', () => {
  it('openFileInPane adds a new file tab and activates it', () => {
    const ed = newEditorLeaf();                       // welcome
    const s = editorStateWithRoot(ed);
    const next = openFileInPane(s, ed.id, '/proj/a.ts');
    const e = editorActiveRoot(next) as EditorLeaf;
    expect(e.files).toHaveLength(1);
    expect(e.files[0].path).toBe('/proj/a.ts');
    expect(e.activeFileId).toBe(e.files[0].fileId);
  });

  it('openFileInPane activates an already-open file instead of duplicating', () => {
    const ed = newEditorLeaf('/proj/a.ts');
    const s0 = editorStateWithRoot(ed);
    const s1 = openFileInPane(s0, ed.id, '/proj/b.ts'); // now 2 tabs, b active
    const s2 = openFileInPane(s1, ed.id, '/proj/a.ts'); // re-open a → just activate
    const e2 = editorActiveRoot(s2) as EditorLeaf;
    expect(e2.files).toHaveLength(2);                   // not duplicated
    expect(e2.activeFileId).toBe(e2.files[0].fileId);   // a is active again
    expect(e2.files[0].path).toBe('/proj/a.ts');
  });

  it('openFileInPane assigns mode=source for non-md, source-default for md', () => {
    const ed = newEditorLeaf();
    const s = openFileInPane(editorStateWithRoot(ed), ed.id, '/r.md');
    const e = editorActiveRoot(s) as EditorLeaf;
    expect(e.files[0].mode).toBe('source');            // mode defaults to source
  });

  it('openFileInPane is a no-op on a terminal pane', () => {
    const t = newLeaf('/t');
    const s = editorStateWithRoot(t);
    expect(openFileInPane(s, t.id, '/x.ts')).toBe(s);  // same ref
  });
});

describe('setActiveEditorFile + closeEditorFile', () => {
  it('setActiveEditorFile on a terminal pane is a no-op (same ref)', () => {
    const t = newLeaf('/t');
    const s = editorStateWithRoot(t);
    expect(setActiveEditorFile(s, t.id, 'whatever')).toBe(s);
  });

  it('setActiveEditorFile switches the active tab', () => {
    const ed = newEditorLeaf('/a.ts');
    const s0 = openFileInPane(editorStateWithRoot(ed), ed.id, '/b.ts'); // a,b ; b active
    const e0 = editorActiveRoot(s0) as EditorLeaf;
    const aId = e0.files[0].fileId;
    const s1 = setActiveEditorFile(s0, ed.id, aId);
    expect((editorActiveRoot(s1) as EditorLeaf).activeFileId).toBe(aId);
  });

  it('closeEditorFile removes a tab and re-activates the previous one', () => {
    const ed = newEditorLeaf('/a.ts');
    const s0 = openFileInPane(editorStateWithRoot(ed), ed.id, '/b.ts'); // a,b ; b active
    const e0 = editorActiveRoot(s0) as EditorLeaf;
    const bId = e0.files[1].fileId;
    const s1 = closeEditorFile(s0, ed.id, bId);
    const e1 = editorActiveRoot(s1) as EditorLeaf;
    expect(e1.files).toHaveLength(1);
    expect(e1.files[0].path).toBe('/a.ts');
    expect(e1.activeFileId).toBe(e1.files[0].fileId);  // returned to the neighbor
  });

  it('closing the last tab leaves a welcome editor (pane stays)', () => {
    const ed = newEditorLeaf('/a.ts');
    const s0 = editorStateWithRoot(ed);
    const fid = (editorActiveRoot(s0) as EditorLeaf).files[0].fileId;
    const s1 = closeEditorFile(s0, ed.id, fid);
    const e1 = editorActiveRoot(s1) as EditorLeaf;
    expect(e1.kind).toBe('editor');
    expect(e1.files).toEqual([]);
    expect(e1.activeFileId).toBeUndefined();
  });
});

describe('openFileInNewSplit', () => {
  it('openFileInNewSplit splits from a terminal into an editor with the file open', () => {
    const t = newLeaf('/t');
    const s = editorStateWithRoot(t);
    const next = openFileInNewSplit(s, t.id, '/proj/a.ts', 'v');
    const leaves = collectLeaves(editorActiveRoot(next));
    const ed = leaves.find((l) => l.kind === 'editor') as EditorLeaf;
    expect(ed.files[0].path).toBe('/proj/a.ts');
    expect(activeTabOf(next).activePaneId).toBe(ed.id);  // focus on the editor
  });
});

describe('convertPaneToTerminal', () => {
  it('convertPaneToTerminal replaces a welcome editor with a terminal', () => {
    const ed = newEditorLeaf();                       // welcome
    const s = editorStateWithRoot(ed);
    const next = convertPaneToTerminal(s, ed.id);
    const leaf = editorActiveRoot(next);
    expect(leaf.kind).toBe('terminal');
    expect(activeTabOf(next).activePaneId).toBe(leaf.id);
  });

  it('re-points zoom at the new terminal when the replaced editor was zoomed', () => {
    const ed = newEditorLeaf();
    let s = editorStateWithRoot(newSplit('v', [newLeaf('/a'), ed]));
    s = setZoom(s, activeTabOf(s).id, ed.id);         // zoom the editor being replaced
    const next = convertPaneToTerminal(s, ed.id);
    const tab = activeTabOf(next);
    const fresh = collectLeaves(tab.root).find((l) => l.id !== (tab.root as Split).children[0].id)!;
    expect(fresh.kind).toBe('terminal');
    expect(tab.zoomedPaneId).toBe(fresh.id);          // zoom follows the 1:1 replacement
    expect(tab.activePaneId).toBe(fresh.id);
  });

  it('keeps zoom untouched when a DIFFERENT pane is zoomed', () => {
    const term = newLeaf('/a');
    const ed = newEditorLeaf();
    let s = editorStateWithRoot(newSplit('v', [term, ed]));
    s = setZoom(s, activeTabOf(s).id, term.id);       // zoom the sibling terminal
    const next = convertPaneToTerminal(s, ed.id);
    expect(activeTabOf(next).zoomedPaneId).toBe(term.id);
  });
});

describe('splitAsEditor', () => {
  it('splitAsEditor adds a welcome editor pane and focuses it', () => {
    const s = editorStateWithRoot(newLeaf('/t'));   // single terminal
    const paneId = collectLeaves(editorActiveRoot(s) as any)[0].id; // = terminal id
    const next = splitAsEditor(s, paneId, 'v');
    const leaves = collectLeaves(editorActiveRoot(next));
    expect(leaves).toHaveLength(2);
    const ed = leaves.find((l) => l.kind === 'editor') as EditorLeaf;
    expect(ed.files).toEqual([]);                   // welcome
    const tab = activeTabOf(next);
    expect(tab.activePaneId).toBe(ed.id);           // focus on the new editor
  });
});

describe('setEditorMode', () => {
  it('sets the mode of the ACTIVE file tab (not leaf.mode)', () => {
    const e = newEditorLeaf('/x.md'); // activeFile.mode defaults to 'source'
    const s = editorStateWithRoot(e);
    const next = setEditorMode(s, e.id, 'preview');
    const leaf = findLeaf(editorActiveRoot(next), e.id) as EditorLeaf;
    expect(leaf.files[0].mode).toBe('preview');
  });

  it('switches between split and source on the active file tab', () => {
    const e = newEditorLeaf('/x.md');
    const s = editorStateWithRoot(newSplit('v', [newLeaf('/a'), e]));
    const split = setEditorMode(s, e.id, 'split');
    expect((findLeaf(editorActiveRoot(split), e.id) as EditorLeaf).files[0].mode).toBe('split');
    const back = setEditorMode(split, e.id, 'source');
    expect((findLeaf(editorActiveRoot(back), e.id) as EditorLeaf).files[0].mode).toBe('source');
  });

  it('does not touch a terminal leaf (no mode field added)', () => {
    const t = newLeaf('/a');
    const s = editorStateWithRoot(newSplit('v', [t, newEditorLeaf('/x.md')]));
    const next = setEditorMode(s, t.id, 'preview');
    const leaf = findLeaf(editorActiveRoot(next), t.id) as any;
    expect(leaf.mode).toBeUndefined();
    expect(leaf.kind).toBe('terminal');
  });

  it('returns the same state for an unknown paneId (no-op)', () => {
    const s = editorStateWithRoot(newEditorLeaf('/x.md'));
    expect(setEditorMode(s, 'no-such-id', 'split')).toBe(s);
  });
});

describe('bottom panel', () => {
  it('toggleBottomPanel: hidden (default) -> open -> hidden', () => {
    const s = toggleBottomPanel(initialState());
    expect(s.ui?.bottomPanelOpen).toBe(true);
    expect(toggleBottomPanel(s).ui?.bottomPanelOpen).toBe(false);
  });
  it('toggleBottomPanel preserves other ui fields (via readUi)', () => {
    const s = toggleBottomPanel(initialState());
    expect(s.ui).toMatchObject({
      sidebarCollapsed: false, sidebarWidth: SIDEBAR_DEFAULT, bottomPanelHeight: BOTTOM_PANEL_DEFAULT,
    });
  });
  it('setBottomPanelHeight clamps to [MIN, MAX]', () => {
    expect(setBottomPanelHeight(initialState(), 10).ui?.bottomPanelHeight).toBe(BOTTOM_PANEL_MIN);
    expect(setBottomPanelHeight(initialState(), 9999).ui?.bottomPanelHeight).toBe(BOTTOM_PANEL_MAX);
    expect(setBottomPanelHeight(initialState(), 320).ui?.bottomPanelHeight).toBe(320);
  });
  it('setBottomPanelHeight does not touch the open state', () => {
    const open = toggleBottomPanel(initialState());
    expect(setBottomPanelHeight(open, 300).ui?.bottomPanelOpen).toBe(true);
  });
  it('immutability: the source state is not mutated', () => {
    const s0 = initialState();
    toggleBottomPanel(s0);
    expect(s0.ui?.bottomPanelOpen ?? false).toBe(false);
  });
});

import { toggleRightArea, setRightAreaWidth } from './reducers';
import { RIGHT_AREA_DEFAULT, RIGHT_AREA_MAX } from './rightArea';

describe('right area (③)', () => {
  it('toggleRightArea toggles rightAreaOpen (default false -> true)', () => {
    const s = initialState();
    expect(toggleRightArea(s).ui?.rightAreaOpen).toBe(true);
  });
  it('setRightAreaWidth clamps', () => {
    const s = initialState();
    expect(setRightAreaWidth(s, 9999).ui?.rightAreaWidth).toBe(RIGHT_AREA_MAX);
  });
  it('setRightAreaWidth NaN -> default', () => {
    const s = initialState();
    expect(setRightAreaWidth(s, NaN).ui?.rightAreaWidth).toBe(RIGHT_AREA_DEFAULT);
  });
});

describe('setTermFontSize / setEditorFontSize', () => {
  it('sets termFontSize clamped, without touching editorFontSize/uiFontSize', () => {
    const s = setTermFontSize(initialState(), 18);
    expect(s.ui?.termFontSize).toBe(18);
    expect(s.ui?.editorFontSize).toBe(13);
    expect(s.ui?.uiFontSize).toBe(13);
  });
  it('clamps termFontSize to [9,24]', () => {
    expect(setTermFontSize(initialState(), 999).ui?.termFontSize).toBe(24);
    expect(setTermFontSize(initialState(), 1).ui?.termFontSize).toBe(9);
  });
  it('sets editorFontSize independently', () => {
    const s = setEditorFontSize(initialState(), 16);
    expect(s.ui?.editorFontSize).toBe(16);
    expect(s.ui?.termFontSize).toBe(13);
  });
});

import { setLocalePref } from './reducers';
describe('setLocalePref', () => {
  it('writes ui.locale immutably and keeps other ui fields', () => {
    const s = setUiFont(initialState(), 'serif');
    const n = setLocalePref(s, 'en');
    expect(n.ui?.locale).toBe('en');
    expect(n.ui?.uiFont).toBe('serif');   // preserved via readUi
    expect(n).not.toBe(s);
  });
});

describe('openPluginView', () => {
  it('splits the bottom-right-most leaf, plugin becomes its 2nd child (right/bottom)', () => {
    let s = initialState();
    // active tab = single console; open the plugin
    s = openPluginView(s, 'p1', 'main');
    const tab = s.spaces[0].tabs[0];
    const leaves = collectLeaves(tab.root);
    const plug = leaves.find((l) => l.kind === 'plugin') as any;
    expect(plug).toBeTruthy();
    expect(plug.pluginId).toBe('p1');
    expect(plug.viewId).toBe('main');
    // plugin is the last leaf (right/bottom), active
    expect(leaves[leaves.length - 1].id).toBe(plug.id);
    expect(tab.activePaneId).toBe(plug.id);
  });

  it('creates a NEW tile on every call (duplicates allowed — multi-instance)', () => {
    let s = openPluginView(initialState(), 'p1', 'main');
    const firstId = collectLeaves(s.spaces[0].tabs[0].root).find((l) => l.kind === 'plugin')!.id;
    s = openPluginView(s, 'p1', 'main');
    const plugs = collectLeaves(s.spaces[0].tabs[0].root).filter((l) => l.kind === 'plugin');
    expect(plugs.length).toBe(2);                          // duplicate created
    expect(plugs.some((l) => l.id === firstId)).toBe(true); // the first one is intact
    expect(s.spaces[0].tabs[0].activePaneId).not.toBe(firstId); // the new one is active
  });

  it('closePane removes a plugin leaf and collapses the split like any leaf', () => {
    let s = openPluginView(initialState(), 'p1', 'main');          // 2 leaves: terminal + plugin
    const plug = collectLeaves(s.spaces[0].tabs[0].root).find((l) => l.kind === 'plugin')!;
    s = closePane(s, plug.id);
    const leaves = collectLeaves(s.spaces[0].tabs[0].root);
    expect(leaves.some((l) => l.kind === 'plugin')).toBe(false);
    expect(leaves.length).toBe(1);                                 // split collapsed into a console
    expect(s.spaces[0].tabs[0].root.kind).toBe('terminal');
  });
});

// FIX 2: structure/focus reducers vs zoom — creating a new pane while the tab is
// zoomed must EXIT zoom (otherwise the new pane is focused yet display:none).
describe('zoom vs structure/focus reducers', () => {
  it('splitPane exits zoom of the modified tab', () => {
    const { state, leafId } = stateWithLeafCwd('/w');
    let s = setZoom(state, 't', leafId);
    s = splitPane(s, leafId, 'v');
    expect(s.spaces[0].tabs[0].zoomedPaneId).toBeNull();
  });

  it('splitAsEditor exits zoom of the modified tab', () => {
    const { state, leafId } = stateWithLeafCwd('/w');
    let s = setZoom(state, 't', leafId);
    s = splitAsEditor(s, leafId, 'v');
    expect(s.spaces[0].tabs[0].zoomedPaneId).toBeNull();
  });

  it('openFileInNewSplit exits zoom of the modified tab', () => {
    const { state, leafId } = stateWithLeafCwd('/w');
    let s = setZoom(state, 't', leafId);
    s = openFileInNewSplit(s, leafId, '/proj/a.ts', 'v');
    expect(s.spaces[0].tabs[0].zoomedPaneId).toBeNull();
  });

  it('openPluginView exits zoom of the tab that receives the tile', () => {
    const base = initialState();
    const tabId = base.spaces[0].tabs[0].id;
    const leafId = (base.spaces[0].tabs[0].root as Leaf).id;
    let s = setZoom(base, tabId, leafId);
    s = openPluginView(s, 'p1', 'main');
    expect(s.spaces[0].tabs[0].zoomedPaneId).toBeNull();
  });

  it('openPluginView leaves the zoom of an UNRELATED tab intact', () => {
    let s = initialState();
    const tab1 = s.spaces[0].tabs[0];
    const tab1Leaf = (tab1.root as Leaf).id;
    s = addTab(s, s.spaces[0].id, 't2');        // tab2 becomes active
    s = setZoom(s, tab1.id, tab1Leaf);          // zoom lives in the inactive tab1
    s = openPluginView(s, 'p1', 'main');        // tile lands in tab2
    expect(s.spaces[0].tabs[0].zoomedPaneId).toBe(tab1Leaf); // tab1 untouched
    expect(s.spaces[0].tabs[1].zoomedPaneId).toBeNull();
  });

  it('focusNeighbor is a no-op while the active tab is zoomed', () => {
    const a = newLeaf();
    const b = newLeaf();
    const s0 = stateWithRoot(newSplit('v', [a, b]), a.id);
    const s = setZoom(s0, 't', a.id);
    expect(focusNeighbor(s, 'right')).toBe(s);  // same ref — hidden siblings are not navigable
  });
});

describe('splitPane on a plugin leaf', () => {
  it('duplicates the plugin view (new leaf, same pluginId/viewId) instead of a terminal', () => {
    // Start from a state that has only a plugin leaf (no terminal) to verify the split
    // produces two plugin leaves and no terminal — i.e., no spurious terminal is created.
    const base = initialState();
    const tab = base.spaces[0].tabs[0];
    const onlyPluginState = {
      ...base,
      spaces: [{
        ...base.spaces[0],
        tabs: [{ ...tab, root: { kind: 'plugin' as const, id: tab.root.id, pluginId: 'p1', viewId: 'main' }, activePaneId: tab.root.id }],
      }],
    };
    const plug = onlyPluginState.spaces[0].tabs[0].root;
    const s = splitPane(onlyPluginState, plug.id, 'v');
    const plugs = collectLeaves(s.spaces[0].tabs[0].root).filter((l) => l.kind === 'plugin') as any[];
    expect(plugs.length).toBe(2);
    expect(plugs.every((l) => l.pluginId === 'p1' && l.viewId === 'main')).toBe(true);
    expect(collectLeaves(s.spaces[0].tabs[0].root).some((l) => l.kind === 'terminal')).toBe(false);
  });
});
