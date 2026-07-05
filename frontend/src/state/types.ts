// Layout model (spec §5). The typed schema lives on the frontend; the Go core
// stores it as opaque JSON. PaneNode is recursive (splits land in Plan 3b); in
// 3a every tab.root is a single Leaf.
import { SIDEBAR_DEFAULT } from './sidebar';
import { DEFAULT_ALERT_COLOR } from './alertColors';
import type { ColorValue, FontKey } from './appearance';
export type PaneId = string;
export type SpaceId = string;
export type TabId = string;
export type SplitId = string;

export interface TerminalLeaf {
  kind: 'terminal';
  id: PaneId;
  cwd: string;
  title?: string; // user-set pane name; the header falls back to cwd when unset
}

export type EditorMode = 'source' | 'split' | 'preview';

// A single open file tab inside an editor pane. fileId is stable across
// sessions (round-trips in layout.json) — the key for editorBuffers and the Go draft.
export interface EditorFile {
  fileId: string;
  path: string;
  mode?: EditorMode;
}

export interface EditorLeaf {
  kind: 'editor';
  id: PaneId;
  files: EditorFile[];      // [] = welcome state (editor with no file)
  activeFileId?: string;    // id of the active tab; undefined when files is empty
}

export interface PluginLeaf {
  kind: 'plugin';
  id: PaneId;
  pluginId: string;   // plugin manifest id
  viewId: string;     // contributes.views[].id
}

export type Leaf = TerminalLeaf | EditorLeaf | PluginLeaf;

export interface Split {
  kind: 'split';
  id: SplitId;
  dir: 'h' | 'v';
  ratio: number[];
  children: PaneNode[];
}

export type PaneNode = Leaf | Split;

export interface Tab {
  id: TabId;
  title: string;
  activePaneId: PaneId;
  zoomedPaneId: PaneId | null;
  root: PaneNode;
}

export interface Space {
  id: SpaceId;
  name: string;
  collapsed: boolean;
  activeTabId: TabId;
  tabs: Tab[]; // always >= 1 (one-tab-space rule is display-only)
}

export interface UiState {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  alertColor?: ColorValue;
  activeColor?: ColorValue; // active pane color (= --accent); preset name or hex
  exitColor?: ColorValue;   // border color of an exited console (= --exit)
  uiFont?: FontKey;         // font family for titles
  uiFontSize?: number;      // title size, px
  termFontSize?: number;    // terminal content font size, px
  editorFontSize?: number;  // editor content font size, px
  bottomPanelOpen?: boolean;   // whether the bottom panel is open (④)
  bottomPanelHeight?: number;  // bottom panel height, px
  rightAreaOpen?: boolean;     // whether the right column is open (③)
  rightAreaWidth?: number;     // right column width, px
  locale?: string;             // active UI language id (e.g. 'en'); i18n resolves the dict
}

export interface AppState {
  activeSpaceId: SpaceId;
  spaces: Space[]; // order is array position
  ui?: UiState;    // optional → backward compatibility with the old layout.json
}

export function isLeaf(node: PaneNode): node is Leaf {
  return node.kind !== 'split';
}

export function newLeaf(cwd = ''): TerminalLeaf {
  return { kind: 'terminal', id: crypto.randomUUID(), cwd };
}

export function newEditorFile(path: string, mode: EditorMode = 'source'): EditorFile {
  return { fileId: crypto.randomUUID(), path, mode };
}

// path given → one active tab; path === undefined → welcome (no files).
export function newEditorLeaf(path?: string, mode: EditorMode = 'source'): EditorLeaf {
  if (path === undefined) return { kind: 'editor', id: crypto.randomUUID(), files: [] };
  const f = newEditorFile(path, mode);
  return { kind: 'editor', id: crypto.randomUUID(), files: [f], activeFileId: f.fileId };
}

// Active tab of an editor leaf (undefined for welcome / a broken activeFileId).
export function activeEditorFile(leaf: EditorLeaf): EditorFile | undefined {
  return leaf.files.find((f) => f.fileId === leaf.activeFileId);
}

export function newPluginLeaf(pluginId: string, viewId: string): PluginLeaf {
  return { kind: 'plugin', id: crypto.randomUUID(), pluginId, viewId };
}

export function newSplit(dir: 'h' | 'v', children: PaneNode[], ratio?: number[]): Split {
  return {
    kind: 'split',
    id: crypto.randomUUID(),
    dir,
    children,
    ratio: ratio ?? children.map(() => 1 / children.length),
  };
}

export function newTab(title = 'shell', cwd = ''): Tab {
  const leaf = newLeaf(cwd);
  return { id: crypto.randomUUID(), title, activePaneId: leaf.id, zoomedPaneId: null, root: leaf };
}

export function newSpace(name = 'space'): Space {
  const tab = newTab();
  return { id: crypto.randomUUID(), name, collapsed: false, activeTabId: tab.id, tabs: [tab] };
}

export function initialState(): AppState {
  const space = newSpace('space 1');
  return {
    activeSpaceId: space.id,
    spaces: [space],
    ui: { sidebarCollapsed: false, sidebarWidth: SIDEBAR_DEFAULT, alertColor: DEFAULT_ALERT_COLOR },
  };
}

// Target for moving a console (DnD pane → navigator row): into a tab or into a space.
export type NavMoveTarget =
  | { kind: 'tab'; spaceId: SpaceId; tabId: TabId }
  | { kind: 'space'; spaceId: SpaceId };
