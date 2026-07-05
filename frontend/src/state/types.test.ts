import { describe, it, expect } from 'vitest';
import { newLeaf, newTab, newSpace, initialState, newSplit, newEditorLeaf, newEditorFile, activeEditorFile, isLeaf, newPluginLeaf, type Leaf, type EditorLeaf, type TerminalLeaf } from './types';
import { SIDEBAR_DEFAULT } from './sidebar';
import { DEFAULT_ALERT_COLOR } from './alertColors';

describe('factories', () => {
  it('newLeaf is a terminal node with a unique id and given cwd', () => {
    const a = newLeaf('/tmp');
    expect(a.kind).toBe('terminal');
    expect(a.cwd).toBe('/tmp');
    expect(newLeaf().id).not.toBe(a.id);
  });

  it('newTab holds one leaf and points activePaneId at it', () => {
    const t = newTab('shell', '/work');
    expect(t.title).toBe('shell');
    expect(t.root.kind).toBe('terminal');
    expect(t.zoomedPaneId).toBeNull();
    const leaf = t.root as Leaf;
    expect(t.activePaneId).toBe(leaf.id);
    expect((leaf as TerminalLeaf).cwd).toBe('/work');
  });

  it('newSpace holds exactly one tab and activates it', () => {
    const s = newSpace('s1');
    expect(s.name).toBe('s1');
    expect(s.collapsed).toBe(false);
    expect(s.tabs).toHaveLength(1);
    expect(s.activeTabId).toBe(s.tabs[0].id);
  });

  it('initialState has one active space with one tab', () => {
    const st = initialState();
    expect(st.spaces).toHaveLength(1);
    expect(st.activeSpaceId).toBe(st.spaces[0].id);
    expect(st.spaces[0].tabs).toHaveLength(1);
  });
});

describe('newSplit', () => {
  it('is a split node with a unique id, dir, children and even ratios by default', () => {
    const a = newLeaf();
    const b = newLeaf();
    const sp = newSplit('v', [a, b]);
    expect(sp.kind).toBe('split');
    expect(sp.dir).toBe('v');
    expect(sp.children).toEqual([a, b]);
    expect(sp.ratio).toEqual([0.5, 0.5]);
    expect(newSplit('h', [a, b]).id).not.toBe(sp.id);
  });

  it('accepts an explicit ratio', () => {
    const sp = newSplit('v', [newLeaf(), newLeaf()], [0.7, 0.3]);
    expect(sp.ratio).toEqual([0.7, 0.3]);
  });
});

describe('initialState ui', () => {
  it('seeds the default ui (sidebar open, default width)', () => {
    expect(initialState().ui).toEqual({ sidebarCollapsed: false, sidebarWidth: SIDEBAR_DEFAULT, alertColor: DEFAULT_ALERT_COLOR });
  });
});

describe('Leaf union', () => {
  it('newEditorLeaf with a path opens one file tab, active', () => {
    const e = newEditorLeaf('/tmp/README.md');
    expect(e.kind).toBe('editor');
    expect(e.files).toHaveLength(1);
    expect(e.files[0].path).toBe('/tmp/README.md');
    expect(e.files[0].mode).toBe('source');
    expect(typeof e.files[0].fileId).toBe('string');
    expect(e.activeFileId).toBe(e.files[0].fileId);
  });

  it('newEditorLeaf without a path is a welcome editor (no files)', () => {
    const e: EditorLeaf = newEditorLeaf();
    expect(e.files).toEqual([]);
    expect(e.activeFileId).toBeUndefined();
  });

  it('newEditorFile mints a unique fileId and default source mode', () => {
    const a = newEditorFile('/a.ts');
    const b = newEditorFile('/b.md', 'preview');
    expect(a.fileId).not.toBe(b.fileId);
    expect(a.mode).toBe('source');
    expect(b.mode).toBe('preview');
  });

  it('activeEditorFile returns the active file or undefined for welcome', () => {
    const e = newEditorLeaf('/x.md');
    expect(activeEditorFile(e)?.path).toBe('/x.md');
    expect(activeEditorFile(newEditorLeaf())).toBeUndefined();
  });

  it('isLeaf is true for an editor leaf (any shape)', () => {
    expect(isLeaf(newEditorLeaf('/x'))).toBe(true);
    expect(isLeaf(newEditorLeaf())).toBe(true);
  });

  it('isLeaf discriminates leaves from splits', () => {
    expect(isLeaf(newLeaf('/a'))).toBe(true);
    expect(isLeaf(newEditorLeaf('/x'))).toBe(true);
    expect(isLeaf(newSplit('v', [newLeaf(), newLeaf()]))).toBe(false);
  });

  it('newLeaf still creates a terminal leaf', () => {
    const t = newLeaf('/home');
    expect(t.kind).toBe('terminal');
    expect(t.cwd).toBe('/home');
  });
});

describe('PluginLeaf', () => {
  it('newPluginLeaf builds a plugin leaf with a fresh id', () => {
    const a = newPluginLeaf('dev.term.tool', 'main');
    expect(a.kind).toBe('plugin');
    expect(a.pluginId).toBe('dev.term.tool');
    expect(a.viewId).toBe('main');
    expect(a.id).toMatch(/[0-9a-f-]{36}/);
    expect(newPluginLeaf('x', 'y').id).not.toBe(a.id);
  });
  it('is assignable to Leaf', () => {
    const l: Leaf = newPluginLeaf('p', 'v');
    expect(l.kind).toBe('plugin');
  });
});
