import type { AppState, EditorFile, EditorLeaf, Leaf, PaneId, PaneNode, Space, SpaceId, Tab, TabId } from './types';
import { isLeaf, activeEditorFile } from './types';

// Node helpers (recursive; in 3a roots are single leaves, but 3b adds splits).
export function firstLeaf(node: PaneNode): Leaf {
  return isLeaf(node) ? node : firstLeaf(node.children[0]);
}

export function findLeaf(node: PaneNode, id: PaneId): Leaf | null {
  if (isLeaf(node)) return node.id === id ? node : null;
  for (const c of node.children) {
    const f = findLeaf(c, id);
    if (f) return f;
  }
  return null;
}

// Collect all leaves of a subtree left-to-right.
export function collectLeaves(node: PaneNode): Leaf[] {
  return isLeaf(node) ? [node] : node.children.flatMap((c) => collectLeaves(c));
}

// The first editor leaf of a subtree left-to-right, or null.
export function firstEditorLeaf(node: PaneNode): EditorLeaf | null {
  if (isLeaf(node)) return node.kind === 'editor' ? node : null;
  for (const c of node.children) {
    const f = firstEditorLeaf(c);
    if (f) return f;
  }
  return null;
}

// All open files of editor leaves in a subtree (for confirm-on-close and restore).
export function editorFilesIn(node: PaneNode): EditorFile[] {
  return collectLeaves(node)
    .filter((l): l is EditorLeaf => l.kind === 'editor')
    .flatMap((l) => l.files);
}

// All editor files across the whole state (all spaces/tabs) — for restore/orphan.
export function allEditorFiles(state: AppState): EditorFile[] {
  return state.spaces.flatMap((sp) => sp.tabs).flatMap((t) => editorFilesIn(t.root));
}

// Where to open a file (rule §5.5): the active pane if it is an editor; otherwise
// the first editor leaf of the tab; otherwise null (the caller makes a new split).
export function editorOpenTarget(root: PaneNode, activePaneId: PaneId): EditorLeaf | null {
  const active = findLeaf(root, activePaneId);
  if (active && active.kind === 'editor') return active;
  return firstEditorLeaf(root);
}

// The fileId of the active file tab of the active editor leaf — needed by Stage C
// after the open reducer to record pendingGoto. null if the active leaf is not an editor.
export function openedFileId(state: AppState): string | null {
  const space = state.spaces.find((sp) => sp.id === state.activeSpaceId);
  if (!space) return null;
  const tab = space.tabs.find((t) => t.id === space.activeTabId);
  if (!tab) return null;
  const leaf = findLeaf(tab.root, tab.activePaneId);
  if (!leaf || leaf.kind !== 'editor') return null;
  return leaf.activeFileId ?? null;
}

// A tab's alert sum = Σ of its leaves' counters; a space's = Σ over its tabs.
export function tabAlertCount(counts: Record<string, number>, tab: Tab): number {
  return collectLeaves(tab.root).reduce((n, l) => n + (counts[l.id] ?? 0), 0);
}
export function spaceAlertCount(counts: Record<string, number>, space: Space): number {
  return space.tabs.reduce((n, t) => n + tabAlertCount(counts, t), 0);
}

// All terminal (leaf) ids in a subtree, in left-to-right order. Used to size and
// scan a delete target (how many terminals, are any "touched").
export function leafIds(node: PaneNode): PaneId[] {
  return collectLeaves(node).map((l) => l.id);
}

// Total terminals (leaves) across the whole layout — over all spaces and tabs.
// The number source for the status-bar counter (always correct, without mount/liveSet).
export function terminalCount(s: AppState): number {
  return s.spaces.reduce(
    (n, sp) => n + sp.tabs.reduce((m, t) => m + collectLeaves(t.root).length, 0),
    0,
  );
}

// English pluralization for the status-bar console counter.
export function pluralConsoles(n: number): string {
  return n === 1 ? 'console' : 'consoles';
}

// One flat list of rows for the NavigatorTree. One-tab spaces render as a single
// row (no children); multi-tab spaces render a space row plus, when expanded,
// one row per tab (spec §8 display rule).
export interface NavRow {
  kind: 'space' | 'tab';
  spaceId: SpaceId;
  tabId: TabId | null;
  label: string;
  depth: number; // 0 space, 1 tab
  expandable: boolean; // space with >1 tab
  collapsed: boolean; // space collapsed flag (only meaningful when expandable)
  active: boolean;
  // S3.2: the number of tabs in the space (0 for tab rows); the space's aggregate status
  // (null for tab rows and for non-collapsed/single-tab spaces).
  // The live aggregate (running/exited) is passed through the rowStatus callback in App
  // (selectors.ts stays pure, does not read stores).
  tabCount: number;
  aggStatus: import('./paneStatus').PaneStatus | null;
}

export function navigatorRows(s: AppState): NavRow[] {
  const rows: NavRow[] = [];
  for (const space of s.spaces) {
    const multi = space.tabs.length > 1;
    const spaceActive = space.id === s.activeSpaceId;
    // Leave aggStatus null: the live aggregate (running/exited) is not computed
    // in the pure selector (no access to exitedPanes/$state). We color via the rowStatus
    // callback in App (which reads $state exitedPanes and alerts).
    rows.push({
      kind: 'space',
      spaceId: space.id,
      tabId: null,
      label: space.name,
      depth: 0,
      expandable: multi,
      collapsed: space.collapsed,
      active: spaceActive,
      tabCount: space.tabs.length,
      aggStatus: null,
    });
    if (multi && !space.collapsed) {
      for (const tab of space.tabs) {
        rows.push({
          kind: 'tab',
          spaceId: space.id,
          tabId: tab.id,
          label: tab.title,
          depth: 1,
          expandable: false,
          collapsed: false,
          active: spaceActive && tab.id === space.activeTabId,
          tabCount: 0,
          aggStatus: null,
        });
      }
    }
  }
  return rows;
}

export function breadcrumbParts(s: AppState): string[] {
  const space = s.spaces.find((sp) => sp.id === s.activeSpaceId);
  if (!space) return [];
  if (space.tabs.length <= 1) return [space.name];
  const tab = space.tabs.find((t) => t.id === space.activeTabId);
  return tab ? [space.name, tab.title] : [space.name];
}

export function activeTab(s: AppState): Tab | null {
  const space = s.spaces.find((sp) => sp.id === s.activeSpaceId);
  if (!space) return null;
  return space.tabs.find((t) => t.id === space.activeTabId) ?? null;
}

export function activeTerminal(s: AppState): { paneId: PaneId; cwd: string } | null {
  const space = s.spaces.find((sp) => sp.id === s.activeSpaceId);
  if (!space) return null;
  const tab = space.tabs.find((t) => t.id === space.activeTabId);
  if (!tab) return null;
  const leaf = findLeaf(tab.root, tab.activePaneId) ?? firstLeaf(tab.root);
  const cwd = leaf.kind === 'terminal' ? leaf.cwd : ''; // editor leaf → default cwd
  return { paneId: leaf.id, cwd };
}

// Find a leaf by id across all spaces, tabs and subtrees (for SP-A).
export function findLeafInApp(app: AppState, id: string): Leaf | undefined {
  for (const sp of app.spaces) {
    for (const t of sp.tabs) {
      const found = collectLeaves(t.root).find((l) => l.id === id);
      if (found) return found;
    }
  }
  return undefined;
}

// Find which space/tab the leaf paneId lives in (for focusing from a toast). null — closed.
export function locatePane(
  app: AppState,
  paneId: string,
): { spaceId: string; tabId: string; paneId: string } | null {
  for (const sp of app.spaces)
    for (const t of sp.tabs)
      if (collectLeaves(t.root).some((l) => l.id === paneId))
        return { spaceId: sp.id, tabId: t.id, paneId };
  return null;
}

// A human-readable pane label for the toast title. null — not found.
export function paneLabel(app: AppState, paneId: string): string | null {
  const leaf = findLeafInApp(app, paneId);
  if (!leaf) return null;
  if (leaf.kind === 'terminal')
    return leaf.title ?? (leaf.cwd ? leaf.cwd.split('/').filter(Boolean).pop() ?? 'terminal' : 'terminal');
  if (leaf.kind === 'editor') {
    const f = activeEditorFile(leaf);
    return f ? (f.path.split('/').filter(Boolean).pop() ?? 'editor') : 'editor';
  }
  return leaf.pluginId; // plugin leaf
}
