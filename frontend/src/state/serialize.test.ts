import { describe, it, expect } from 'vitest';
import { initialState, newEditorLeaf, newLeaf, newSplit, newPluginLeaf } from './types';
import { addTab } from './reducers';
import { serialize, deserialize, loadOrDefault } from './serialize';
import { splitPane } from './reducers';
import type { Leaf, Split, TerminalLeaf, EditorLeaf } from './types';
import { readUi, SIDEBAR_DEFAULT } from './sidebar';
import { DEFAULT_ALERT_COLOR } from './alertColors';
import { BOTTOM_PANEL_DEFAULT } from './bottomPanel';
import { RIGHT_AREA_DEFAULT } from './rightArea';

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
