import { describe, it, expect } from 'vitest';
import { initialState, newEditorLeaf, newLeaf, newSplit, newPluginLeaf } from './types';
import { addSpace, addTab } from './reducers';
import { serialize, deserialize, loadOrDefault } from './serialize';
import { splitPane } from './reducers';
import type { Leaf, Split, TerminalLeaf, EditorLeaf } from './types';
import { readUi, SIDEBAR_DEFAULT, SIDEBAR_MAX } from './sidebar';
import { DEFAULT_ALERT_COLOR } from './alertColors';
import { BOTTOM_PANEL_DEFAULT, BOTTOM_PANEL_MIN } from './bottomPanel';
import { RIGHT_AREA_DEFAULT, RIGHT_AREA_MAX } from './rightArea';
import { FONT_SIZE_DEFAULT, FONT_SIZE_MAX, FONT_SIZE_MIN } from './appearance';

describe('serialize round-trip', () => {
  it('serialize then deserialize yields an equal state', () => {
    const base = initialState();
    const s = addTab(base, base.spaces[0].id); // any non-trivial state
    const back = deserialize(serialize(s));
    expect(back).toEqual(s);
  });

  it('deserialize throws on a structurally invalid layout', () => {
    expect(() => deserialize('{"activeSpaceId":"x"}')).toThrow();
    expect(() => deserialize('{"activeSpaceId":"x","spaces":[]}')).toThrow(); // empty spaces violates invariant
    expect(() => deserialize('not json')).toThrow();
  });
});

describe('loadOrDefault', () => {
  it('null or empty yields a fresh default', () => {
    expect(loadOrDefault(null).spaces).toHaveLength(1);
    expect(loadOrDefault('').spaces).toHaveLength(1);
  });

  it('invalid JSON falls back to a default', () => {
    expect(loadOrDefault('{bad').spaces).toHaveLength(1);
  });

  it('a valid layout string round-trips', () => {
    const s = initialState();
    expect(loadOrDefault(serialize(s))).toEqual(s);
  });
});

describe('serialize round-trip with splits', () => {
  it('round-trips a tab with a nested split tree', () => {
    let s = initialState();
    const leafId = (s.spaces[0].tabs[0].root as Leaf).id;
    s = splitPane(s, leafId, 'v');
    const first = (s.spaces[0].tabs[0].root as Split).children[0] as Leaf;
    s = splitPane(s, first.id, 'h'); // nested split → non-trivial tree
    const back = deserialize(serialize(s));
    expect(back).toEqual(s);
  });
});

describe('serialize round-trip with pane title', () => {
  it('round-trips a leaf title', () => {
    const s = initialState();
    (s.spaces[0].tabs[0].root as TerminalLeaf).title = 'build';
    const back = deserialize(serialize(s));
    expect((back.spaces[0].tabs[0].root as TerminalLeaf).title).toBe('build');
  });

  it('loads a layout that has no title (backward compatible)', () => {
    const s = initialState();
    const back = deserialize(serialize(s));
    expect((back.spaces[0].tabs[0].root as TerminalLeaf).title).toBeUndefined();
  });
});

describe('ui persist', () => {
  it('round-trip preserves ui', () => {
    const s = { ...initialState(), ui: { sidebarCollapsed: true, sidebarWidth: 360 } };
    expect(deserialize(serialize(s)).ui).toEqual({ sidebarCollapsed: true, sidebarWidth: 360 });
  });
  it('loads a legacy layout without ui (readUi provides defaults)', () => {
    const base = initialState();
    const legacy = JSON.stringify({ activeSpaceId: base.activeSpaceId, spaces: base.spaces });
    const restored = deserialize(legacy);
    expect(restored.ui).toBeUndefined();
    expect(readUi(restored)).toMatchObject({ sidebarCollapsed: false, sidebarWidth: SIDEBAR_DEFAULT, alertColor: DEFAULT_ALERT_COLOR });
  });
});

describe('serialize: ui appearance settings', () => {
  it('round-trip preserves activeColor/exitColor/uiFont/uiFontSize', () => {
    const s = initialState();
    s.ui = {
      sidebarCollapsed: false, sidebarWidth: 220,
      activeColor: '#abcdef', exitColor: 'amber', uiFont: 'palatino', uiFontSize: 17,
    };
    const back = deserialize(serialize(s));
    expect(back.ui).toEqual(s.ui);
  });
});

describe('serialize: bottom-panel ui', () => {
  it('round-trip preserves bottomPanelOpen/bottomPanelHeight', () => {
    const s = initialState();
    s.ui = { sidebarCollapsed: false, sidebarWidth: 220, bottomPanelOpen: true, bottomPanelHeight: 320 };
    const back = deserialize(serialize(s));
    expect(back.ui).toEqual(s.ui);
  });
  it('legacy without bottom-panel fields → readUi provides defaults', () => {
    const base = initialState();
    const restored = deserialize(JSON.stringify({
      activeSpaceId: base.activeSpaceId, spaces: base.spaces,
      ui: { sidebarCollapsed: false, sidebarWidth: 220 },
    }));
    expect(readUi(restored)).toMatchObject({ bottomPanelOpen: false, bottomPanelHeight: BOTTOM_PANEL_DEFAULT });
  });
});

describe('legacy without ui → new width defaults', () => {
  it('legacy without ui → readUi provides new width defaults', () => {
    const base = initialState();
    const restored = deserialize(JSON.stringify({
      activeSpaceId: base.activeSpaceId, spaces: base.spaces,
    }));
    expect(readUi(restored)).toMatchObject({
      sidebarWidth: SIDEBAR_DEFAULT, rightAreaWidth: RIGHT_AREA_DEFAULT,
    });
    expect(SIDEBAR_DEFAULT).toBe(240);
    expect(RIGHT_AREA_DEFAULT).toBe(300);
  });
});

describe('serialize editor leaves + back-compat', () => {
  it('round-trips an editor leaf with file tabs (path+mode+fileId)', () => {
    const s = initialState();
    s.spaces[0].tabs[0].root = newSplit('v', [newLeaf('/a'), newEditorLeaf('/x.md', 'split')]);
    const back = deserialize(serialize(s));
    const root = back.spaces[0].tabs[0].root as Split;
    const ed = root.children[1] as EditorLeaf;
    expect(ed.kind).toBe('editor');
    expect(ed.files[0].path).toBe('/x.md');
    expect(ed.files[0].mode).toBe('split');
    expect(ed.activeFileId).toBe(ed.files[0].fileId);
  });

  it('loads a legacy terminal-only layout unchanged', () => {
    const legacy = JSON.stringify(initialState()); // all leaves terminal
    expect(() => deserialize(legacy)).not.toThrow();
  });

  it('rejects a structurally broken split (no children array)', () => {
    const s: any = initialState();
    s.spaces[0].tabs[0].root = { kind: 'split', id: 'x', dir: 'v', ratio: [1] }; // no children
    expect(loadOrDefault(serialize(s)).spaces[0].tabs[0].root.kind).toBe('terminal'); // degrades to default
  });

  it('round-trips a plugin leaf in the tree', () => {
    const base = initialState();
    base.spaces[0].tabs[0].root = newPluginLeaf('dev.term.tool', 'main');
    base.spaces[0].tabs[0].activePaneId = (base.spaces[0].tabs[0].root as any).id;
    const back = deserialize(serialize(base));
    const leaf = back.spaces[0].tabs[0].root as any;
    expect(leaf.kind).toBe('plugin');
    expect(leaf.pluginId).toBe('dev.term.tool');
    expect(leaf.viewId).toBe('main');
  });
});

// --- FIX 3: deserialize salvages + normalizes instead of all-or-nothing -----

// A valid one-space state with a two-pane split, as a plain-JSON clone for corruption.
function plainSplitState(): any {
  let s = initialState();
  const leafId = (s.spaces[0].tabs[0].root as Leaf).id;
  s = splitPane(s, leafId, 'v');
  return JSON.parse(serialize(s));
}

describe('deserialize: per-node ratio/dir normalization', () => {
  it('replaces a corrupted ratio (null / NaN-serialized / short / negative / zero-sum) with equal ratios', () => {
    // NaN serializes to null inside JSON arrays → [null, 0.5] is the on-disk form of [NaN, 0.5].
    for (const bad of [null, [null, 0.5], [0.5], [-1, 2], [0, 0], 'nope']) {
      const o = plainSplitState();
      o.spaces[0].tabs[0].root.ratio = bad;
      const back = deserialize(JSON.stringify(o));
      const root = back.spaces[0].tabs[0].root as Split;
      expect(root.ratio).toEqual([0.5, 0.5]);
      expect(root.children).toHaveLength(2); // leaves survive
    }
  });

  it('keeps a valid ratio untouched', () => {
    const o = plainSplitState();
    o.spaces[0].tabs[0].root.ratio = [0.7, 0.3];
    const back = deserialize(JSON.stringify(o));
    expect((back.spaces[0].tabs[0].root as Split).ratio).toEqual([0.7, 0.3]);
  });

  it('normalizes an unknown split dir to "h"', () => {
    const o = plainSplitState();
    o.spaces[0].tabs[0].root.dir = 'diagonal';
    const back = deserialize(JSON.stringify(o));
    expect((back.spaces[0].tabs[0].root as Split).dir).toBe('h');
  });

  it('drops a hopeless split child but keeps its valid siblings (ratio re-equalized)', () => {
    const o = plainSplitState();
    o.spaces[0].tabs[0].root.children[1] = 42; // garbage child
    const back = deserialize(JSON.stringify(o));
    const root = back.spaces[0].tabs[0].root as Split;
    expect(root.children).toHaveLength(1);
    expect(root.ratio).toEqual([1]);
  });

  it('keeps an unknown leaf kind (forward-compat)', () => {
    const o = plainSplitState();
    o.spaces[0].tabs[0].root.children[1] = { kind: 'browser', id: 'b1', url: 'x' };
    const back = deserialize(JSON.stringify(o));
    expect((back.spaces[0].tabs[0].root as Split).children[1].kind).toBe('browser');
  });
});

describe('deserialize: dangling id normalization', () => {
  it('re-points a dangling activePaneId at the first leaf', () => {
    const o = plainSplitState();
    o.spaces[0].tabs[0].activePaneId = 'gone';
    const back = deserialize(JSON.stringify(o));
    const first = (back.spaces[0].tabs[0].root as Split).children[0] as Leaf;
    expect(back.spaces[0].tabs[0].activePaneId).toBe(first.id);
  });

  it('nulls a dangling zoomedPaneId (a dangling zoom hides ALL cells)', () => {
    const o = plainSplitState();
    o.spaces[0].tabs[0].zoomedPaneId = 'gone';
    const back = deserialize(JSON.stringify(o));
    expect(back.spaces[0].tabs[0].zoomedPaneId).toBeNull();
  });

  it('keeps a valid zoomedPaneId', () => {
    const o = plainSplitState();
    const zoomId = o.spaces[0].tabs[0].root.children[1].id;
    o.spaces[0].tabs[0].zoomedPaneId = zoomId;
    const back = deserialize(JSON.stringify(o));
    expect(back.spaces[0].tabs[0].zoomedPaneId).toBe(zoomId);
  });

  it('re-points a dangling activeTabId at the first tab', () => {
    const o = plainSplitState();
    o.spaces[0].activeTabId = 'gone';
    const back = deserialize(JSON.stringify(o));
    expect(back.spaces[0].activeTabId).toBe(back.spaces[0].tabs[0].id);
  });

  it('re-points a dangling activeSpaceId at the first space', () => {
    const o = plainSplitState();
    o.activeSpaceId = 'gone';
    const back = deserialize(JSON.stringify(o));
    expect(back.activeSpaceId).toBe(back.spaces[0].id);
  });
});

describe('deserialize: drops only hopeless spaces/tabs, keeps the rest', () => {
  it('one bad space among good ones is dropped, the good ones survive', () => {
    const s = addSpace(initialState(), 'two'); // 2 spaces, active = "two"
    const o = JSON.parse(serialize(s));
    o.spaces[0].tabs[0].root = 42;             // space 1's only tab is hopeless
    const back = deserialize(JSON.stringify(o));
    expect(back.spaces).toHaveLength(1);
    expect(back.spaces[0].id).toBe(s.spaces[1].id);
    expect(back.activeSpaceId).toBe(s.spaces[1].id);
  });

  it('one bad tab among good ones is dropped, the space survives', () => {
    const base = initialState();
    const s = addTab(base, base.spaces[0].id, 't2'); // 2 tabs, t2 active
    const o = JSON.parse(serialize(s));
    o.spaces[0].tabs[0].root = null;                 // first tab hopeless
    const back = deserialize(JSON.stringify(o));
    expect(back.spaces[0].tabs).toHaveLength(1);
    expect(back.spaces[0].tabs[0].id).toBe(s.spaces[0].tabs[1].id);
    expect(back.spaces[0].activeTabId).toBe(s.spaces[0].tabs[1].id);
  });

  it('total garbage still throws; loadOrDefault falls back to a default', () => {
    const garbage = '{"activeSpaceId":1,"spaces":[{"id":5},null,{"id":"x","tabs":[{"root":7}]}]}';
    expect(() => deserialize(garbage)).toThrow();
    expect(loadOrDefault(garbage).spaces).toHaveLength(1); // fresh default
  });
});

describe('deserialize: ui numeric clamps', () => {
  it('clamps present ui numeric fields to their documented ranges', () => {
    const o = plainSplitState();
    o.ui = {
      sidebarCollapsed: false, sidebarWidth: 9999,
      bottomPanelHeight: 5, rightAreaWidth: 100000,
      uiFontSize: 999, termFontSize: -3, editorFontSize: 1,
    };
    const ui = deserialize(JSON.stringify(o)).ui!;
    expect(ui.sidebarWidth).toBe(SIDEBAR_MAX);
    expect(ui.bottomPanelHeight).toBe(BOTTOM_PANEL_MIN);
    expect(ui.rightAreaWidth).toBe(RIGHT_AREA_MAX);
    expect(ui.uiFontSize).toBe(FONT_SIZE_MAX);
    expect(ui.termFontSize).toBe(FONT_SIZE_DEFAULT); // <= 0 → default (clampFontSize)
    expect(ui.editorFontSize).toBe(FONT_SIZE_MIN);
  });

  it('drops a non-numeric numeric field so readUi supplies the default', () => {
    const o = plainSplitState();
    o.ui = { sidebarCollapsed: true, sidebarWidth: 'wide' };
    const back = deserialize(JSON.stringify(o));
    expect(back.ui?.sidebarWidth).toBeUndefined();
    expect(back.ui?.sidebarCollapsed).toBe(true);        // non-clamped fields untouched
    expect(readUi(back).sidebarWidth).toBe(SIDEBAR_DEFAULT);
  });

  it('leaves in-range values as-is', () => {
    const o = plainSplitState();
    o.ui = { sidebarCollapsed: false, sidebarWidth: 300, termFontSize: 15 };
    const ui = deserialize(JSON.stringify(o)).ui!;
    expect(ui.sidebarWidth).toBe(300);
    expect(ui.termFontSize).toBe(15);
  });
});
