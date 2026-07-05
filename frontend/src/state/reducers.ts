import {
  type AppState, type EditorFile, type EditorLeaf, type EditorMode, type Leaf, type NavMoveTarget,
  type PaneId, type PaneNode, type Space, type Split, type SpaceId, type Tab, type TabId,
  initialState, isLeaf, newEditorFile, newEditorLeaf, newLeaf, newPluginLeaf, newSpace, newSplit, newTab,
} from './types';
import { findLeaf, firstLeaf, collectLeaves } from './selectors';
import { clampGrid, buildGrid, autoGridDims } from './grid';
import type { Side, DropTarget } from './dropZone';
import { leafRects, neighbor, type Dir } from './paneGeometry';
import { allEqual, equalRatio } from './ratio';
import { clampSidebarWidth, readUi } from './sidebar';
import { clampBottomPanelHeight } from './bottomPanel';
import { clampRightAreaWidth } from './rightArea';
import { DEFAULT_ALERT_COLOR } from './alertColors';
import {
  clampFontSize, ACTIVE_DEFAULT, EXIT_DEFAULT, FONT_DEFAULT, FONT_SIZE_DEFAULT,
  type ColorValue, type FontKey,
} from './appearance';

// Immutable helper: replace one space by id.
function mapSpace(s: AppState, id: SpaceId, fn: (sp: Space) => Space): AppState {
  return { ...s, spaces: s.spaces.map((sp) => (sp.id === id ? fn(sp) : sp)) };
}

export function addSpace(s: AppState, name?: string): AppState {
  const space = newSpace(name ?? `space ${s.spaces.length + 1}`);
  return { ...s, activeSpaceId: space.id, spaces: [...s.spaces, space] };
}

export function removeSpace(s: AppState, id: SpaceId): AppState {
  const idx = s.spaces.findIndex((sp) => sp.id === id);
  if (idx === -1) return s;
  const remaining = s.spaces.filter((sp) => sp.id !== id);
  if (remaining.length === 0) return initialState();
  const activeSpaceId =
    s.activeSpaceId === id ? remaining[Math.max(0, idx - 1)].id : s.activeSpaceId;
  return { ...s, activeSpaceId, spaces: remaining };
}

export function renameSpace(s: AppState, id: SpaceId, name: string): AppState {
  return mapSpace(s, id, (sp) => ({ ...sp, name }));
}

export function reorderSpace(s: AppState, id: SpaceId, toIndex: number): AppState {
  const from = s.spaces.findIndex((sp) => sp.id === id);
  if (from === -1) return s;
  const spaces = [...s.spaces];
  const [sp] = spaces.splice(from, 1);
  const clamped = Math.max(0, Math.min(toIndex, spaces.length));
  spaces.splice(clamped, 0, sp);
  return { ...s, spaces };
}

export function toggleCollapsed(s: AppState, id: SpaceId): AppState {
  return mapSpace(s, id, (sp) => ({ ...sp, collapsed: !sp.collapsed }));
}

export function setActiveSpace(s: AppState, id: SpaceId): AppState {
  if (!s.spaces.some((sp) => sp.id === id)) return s; // unknown id → no-op
  if (s.activeSpaceId === id) return s; // already active → same ref, no needless re-render
  return { ...s, activeSpaceId: id };
}

export function addTab(s: AppState, spaceId: SpaceId, title?: string): AppState {
  const withTab = mapSpace(s, spaceId, (sp) => {
    const tab = newTab(title ?? `tab ${sp.tabs.length + 1}`);
    return { ...sp, tabs: [...sp.tabs, tab], activeTabId: tab.id };
  });
  return { ...withTab, activeSpaceId: spaceId };
}

export function closeTab(s: AppState, spaceId: SpaceId, tabId: TabId): AppState {
  const space = s.spaces.find((sp) => sp.id === spaceId);
  if (!space) return s;
  // Closing the only tab closes the space itself (one-tab-space rule, design §2).
  if (space.tabs.length <= 1) return removeSpace(s, spaceId);
  const idx = space.tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return s;
  const tabs = space.tabs.filter((t) => t.id !== tabId);
  const activeTabId =
    space.activeTabId === tabId ? tabs[Math.max(0, idx - 1)].id : space.activeTabId;
  return mapSpace(s, spaceId, (sp) => ({ ...sp, tabs, activeTabId }));
}

export function renameTab(s: AppState, spaceId: SpaceId, tabId: TabId, title: string): AppState {
  return mapSpace(s, spaceId, (sp) => ({
    ...sp,
    tabs: sp.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)),
  }));
}

export function setActiveTab(s: AppState, spaceId: SpaceId, tabId: TabId): AppState {
  const sp = s.spaces.find((x) => x.id === spaceId);
  if (!sp || !sp.tabs.some((t) => t.id === tabId)) return s; // unknown space/tab → no-op
  if (s.activeSpaceId === spaceId && sp.activeTabId === tabId) return s; // already active → same ref
  const activated = mapSpace(s, spaceId, (inner) => ({ ...inner, activeTabId: tabId }));
  return { ...activated, activeSpaceId: spaceId };
}

// --- Split tree reducers (Plan 3b) ---------------------------------------

// Apply a transform to the active tab's pane tree.
function mapActiveTabRoot(s: AppState, fn: (root: PaneNode) => PaneNode): AppState {
  const space = s.spaces.find((sp) => sp.id === s.activeSpaceId);
  if (!space) return s;
  return mapSpace(s, space.id, (sp) => ({
    ...sp,
    tabs: sp.tabs.map((t) => (t.id === sp.activeTabId ? { ...t, root: fn(t.root) } : t)),
  }));
}

// Replace leaf `paneId` with a split. If the leaf's direct parent is a split of
// the same `dir`, flatten: insert `fresh` as a sibling; if siblings were already
// equal, equalize all children (1/N), else halve the split leaf's share (design
// §11.2 + equal-panes). Otherwise wrap the leaf in a new binary split.
function splitNode(node: PaneNode, paneId: PaneId, dir: 'h' | 'v', fresh: Leaf): PaneNode {
  if (isLeaf(node)) {
    return node.id === paneId ? newSplit(dir, [node, fresh]) : node;
  }
  const idx = node.children.findIndex((c) => isLeaf(c) && c.id === paneId);
  if (idx !== -1) {
    if (node.dir === dir) {
      const children = [...node.children];
      children.splice(idx + 1, 0, fresh);
      // Equal siblings → stay equal (1/N); otherwise halve the split leaf's share.
      let ratio: number[];
      if (allEqual(node.ratio)) {
        ratio = equalRatio(children.length);
      } else {
        ratio = [...node.ratio];
        const share = node.ratio[idx];
        ratio.splice(idx, 1, share / 2, share / 2);
      }
      return { ...node, children, ratio };
    }
    const wrapped = newSplit(dir, [node.children[idx] as Leaf, fresh]);
    const children = [...node.children];
    children[idx] = wrapped;
    return { ...node, children };
  }
  return { ...node, children: node.children.map((c) => splitNode(c, paneId, dir, fresh)) };
}

export function splitPane(s: AppState, paneId: PaneId, dir: 'h' | 'v'): AppState {
  const space = s.spaces.find((sp) => sp.id === s.activeSpaceId);
  if (!space) return s;
  const tab = space.tabs.find((t) => t.id === space.activeTabId);
  if (!tab) return s;
  const leaf = findLeaf(tab.root, paneId);
  if (!leaf) return s;
  const fresh: Leaf = leaf.kind === 'plugin'
    ? newPluginLeaf(leaf.pluginId, leaf.viewId)         // split a plugin tile → duplicate the view
    : newLeaf(leaf.kind === 'terminal' ? leaf.cwd : ''); // otherwise a new terminal
  return mapSpace(s, space.id, (sp) => ({
    ...sp,
    tabs: sp.tabs.map((t) =>
      t.id === tab.id
        ? { ...t, root: splitNode(t.root, paneId, dir, fresh), activePaneId: fresh.id }
        : t,
    ),
  }));
}

// Split pane `paneId`, inserting a NEW welcome editor leaf (split menu →
// "Editor (empty)"). Mirror of splitPane, but fresh = editor rather than terminal.
export function splitAsEditor(s: AppState, paneId: PaneId, dir: 'h' | 'v'): AppState {
  const space = s.spaces.find((sp) => sp.id === s.activeSpaceId);
  if (!space) return s;
  const tab = space.tabs.find((t) => t.id === space.activeTabId);
  if (!tab || !findLeaf(tab.root, paneId)) return s;
  const fresh = newEditorLeaf();                 // welcome editor
  return mapSpace(s, space.id, (sp) => ({
    ...sp,
    tabs: sp.tabs.map((t) =>
      t.id === tab.id
        ? { ...t, root: splitNode(t.root, paneId, dir, fresh), activePaneId: fresh.id }
        : t),
  }));
}

// Split `paneId`, inserting an editor leaf with file `path` already open (split
// menu "Open file…", and rule §5.5 when there is no editor pane in the tab).
export function openFileInNewSplit(s: AppState, paneId: PaneId, path: string, dir: 'h' | 'v'): AppState {
  const space = s.spaces.find((sp) => sp.id === s.activeSpaceId);
  if (!space) return s;
  const tab = space.tabs.find((t) => t.id === space.activeTabId);
  if (!tab || !findLeaf(tab.root, paneId)) return s;
  const fresh = newEditorLeaf(path);
  return mapSpace(s, space.id, (sp) => ({
    ...sp,
    tabs: sp.tabs.map((t) =>
      t.id === tab.id
        ? { ...t, root: splitNode(t.root, paneId, dir, fresh), activePaneId: fresh.id }
        : t),
  }));
}

// Open a NEW plugin tile view "bottom-right" (spec §4.5, multi-instance — duplicates
// allowed: every call creates a new tile). Split the bottom-right-most pane of the active
// tab (corner via leafRects), the plugin = its bottom/right child; direction is automatic.
export function openPluginView(s: AppState, pluginId: string, viewId: string): AppState {
  const space = s.spaces.find((sp) => sp.id === s.activeSpaceId);
  if (!space) return s;
  const tab = space.tabs.find((t) => t.id === space.activeTabId);
  if (!tab) return s;
  let targetId = ''; let best = -Infinity; let dir: 'h' | 'v' = 'v';
  for (const [id, r] of leafRects(tab.root)) {
    const corner = (r.x + r.w) + (r.y + r.h); // closer to the bottom-right corner
    if (corner > best) { best = corner; targetId = id; dir = r.w >= r.h ? 'v' : 'h'; }
  }
  if (!targetId) return s;
  const fresh = newPluginLeaf(pluginId, viewId);
  return mapSpace(s, space.id, (sp) => ({
    ...sp,
    tabs: sp.tabs.map((t) =>
      t.id === tab.id ? { ...t, root: splitNode(t.root, targetId, dir, fresh), activePaneId: fresh.id } : t),
  }));
}

// Open file `path` in editor leaf `paneId`: already open → activate its file
// tab; otherwise add a new tab (active). Terminal/unknown id → no-op.
export function openFileInPane(s: AppState, paneId: PaneId, path: string): AppState {
  const space = s.spaces.find((sp) => sp.id === s.activeSpaceId);
  if (!space) return s;
  const tab = space.tabs.find((t) => t.id === space.activeTabId);
  if (!tab) return s;
  const leaf = findLeaf(tab.root, paneId);
  if (!leaf || leaf.kind !== 'editor') return s;
  const apply = (node: PaneNode): PaneNode => {
    if (node.kind === 'split') return { ...node, children: node.children.map(apply) };
    if (node.kind !== 'editor' || node.id !== paneId) return node;
    const existing = node.files.find((f) => f.path === path);
    if (existing) return { ...node, activeFileId: existing.fileId };
    const f = newEditorFile(path);
    return { ...node, files: [...node.files, f], activeFileId: f.fileId };
  };
  return mapSpace(s, space.id, (sp) => ({
    ...sp,
    tabs: sp.tabs.map((t) => (t.id === tab.id ? { ...t, root: apply(t.root), activePaneId: paneId } : t)),
  }));
}

// Apply fn to editor leaf `paneId` in the active tab (terminal/unknown id →
// no-op, same ref). Does not reset activePaneId on its own.
function mapEditorLeaf(s: AppState, paneId: PaneId, fn: (leaf: EditorLeaf) => EditorLeaf): AppState {
  const space = s.spaces.find((sp) => sp.id === s.activeSpaceId);
  if (!space) return s;
  const tab = space.tabs.find((t) => t.id === space.activeTabId);
  if (!tab) return s;
  const leaf = findLeaf(tab.root, paneId);
  if (!leaf || leaf.kind !== 'editor') return s; // terminal/unknown → no-op, same ref
  const apply = (node: PaneNode): PaneNode => {
    if (node.kind === 'split') return { ...node, children: node.children.map(apply) };
    return node.kind === 'editor' && node.id === paneId ? fn(node) : node;
  };
  return mapSpace(s, space.id, (sp) => ({
    ...sp,
    tabs: sp.tabs.map((t) => (t.id === tab.id ? { ...t, root: apply(t.root) } : t)),
  }));
}

// Activate file tab `fileId` in editor leaf `paneId`. Unknown ids → no-op.
export function setActiveEditorFile(s: AppState, paneId: PaneId, fileId: string): AppState {
  return mapEditorLeaf(s, paneId, (leaf) =>
    leaf.files.some((f) => f.fileId === fileId) ? { ...leaf, activeFileId: fileId } : leaf);
}

// Close file tab `fileId`. If the active one is closed, the previous (or next)
// one is activated; closing the last leaves a welcome (files:[]).
export function closeEditorFile(s: AppState, paneId: PaneId, fileId: string): AppState {
  return mapEditorLeaf(s, paneId, (leaf) => {
    const idx = leaf.files.findIndex((f) => f.fileId === fileId);
    if (idx === -1) return leaf;
    const files = leaf.files.filter((f) => f.fileId !== fileId);
    let activeFileId = leaf.activeFileId;
    if (leaf.activeFileId === fileId) {
      activeFileId = files.length ? files[Math.max(0, idx - 1)].fileId : undefined;
    }
    return { ...leaf, files, activeFileId };
  });
}

// --- closePane (Plan 3b Task 3) ------------------------------------------

function renormalize(ratio: number[]): number[] {
  const sum = ratio.reduce((a, b) => a + b, 0);
  return sum > 0 ? ratio.map((r) => r / sum) : ratio.map(() => 1 / ratio.length);
}

// Remove leaf `paneId` from the tree. Returns the new node (a split collapses to
// its sole remaining child), a `focusId` neighbor leaf (previous sibling, or the
// next one when the first was removed), and whether the leaf was found. A subtree
// passed here is never reduced to null (a root-leaf close is handled in closePane).
function removeLeaf(
  node: PaneNode,
  paneId: PaneId,
): { node: PaneNode; focusId: PaneId | null; found: boolean } {
  if (isLeaf(node)) {
    return { node, focusId: null, found: node.id === paneId };
  }
  const idx = node.children.findIndex((c) => isLeaf(c) && c.id === paneId);
  if (idx !== -1) {
    const children = node.children.filter((_, i) => i !== idx);
    const ratio = renormalize(node.ratio.filter((_, i) => i !== idx));
    if (children.length === 1) {
      return { node: children[0], focusId: firstLeaf(children[0]).id, found: true };
    }
    const neighbor = children[Math.max(0, idx - 1)];
    return { node: { ...node, children, ratio }, focusId: firstLeaf(neighbor).id, found: true };
  }
  for (let i = 0; i < node.children.length; i++) {
    const res = removeLeaf(node.children[i], paneId);
    if (res.found) {
      const children = [...node.children];
      children[i] = res.node;
      return { node: { ...node, children }, focusId: res.focusId, found: true };
    }
  }
  return { node, focusId: null, found: false };
}

export function closePane(s: AppState, paneId: PaneId): AppState {
  const space = s.spaces.find((sp) => sp.id === s.activeSpaceId);
  if (!space) return s;
  const tab = space.tabs.find((t) => t.id === space.activeTabId);
  if (!tab) return s;
  if (!findLeaf(tab.root, paneId)) return s;
  // Closing the only pane of a tab closes the tab (one-tab-space rule, 3a).
  if (isLeaf(tab.root)) return closeTab(s, space.id, tab.id);
  const res = removeLeaf(tab.root, paneId);
  const root = res.node;
  const activePaneId =
    tab.activePaneId === paneId ? (res.focusId ?? firstLeaf(root).id) : tab.activePaneId;
  const zoomedPaneId = tab.zoomedPaneId === paneId ? null : tab.zoomedPaneId;
  return mapSpace(s, space.id, (sp) => ({
    ...sp,
    tabs: sp.tabs.map((t) => (t.id === tab.id ? { ...t, root, activePaneId, zoomedPaneId } : t)),
  }));
}

// --- setRatio / setZoom / focusPane (Plan 3b Task 4) ---------------------

function setRatioNode(node: PaneNode, splitId: string, ratios: number[]): PaneNode {
  if (isLeaf(node)) return node;
  if (node.id === splitId) {
    return ratios.length === node.children.length ? { ...node, ratio: ratios } : node;
  }
  return { ...node, children: node.children.map((c) => setRatioNode(c, splitId, ratios)) };
}

export function setRatio(s: AppState, splitId: string, ratios: number[]): AppState {
  return mapActiveTabRoot(s, (root) => setRatioNode(root, splitId, ratios));
}

export function setZoom(s: AppState, tabId: TabId, paneId: PaneId | null): AppState {
  return mapSpace(s, s.activeSpaceId, (sp) => ({
    ...sp,
    tabs: sp.tabs.map((t) => (t.id === tabId ? { ...t, zoomedPaneId: paneId } : t)),
  }));
}

export function focusPane(s: AppState, paneId: PaneId): AppState {
  const space = s.spaces.find((sp) => sp.id === s.activeSpaceId);
  if (!space) return s;
  const tab = space.tabs.find((t) => t.id === space.activeTabId);
  if (!tab || !findLeaf(tab.root, paneId)) return s;
  return mapSpace(s, space.id, (sp) => ({
    ...sp,
    tabs: sp.tabs.map((t) => (t.id === tab.id ? { ...t, activePaneId: paneId } : t)),
  }));
}

export function setPaneTitle(s: AppState, paneId: PaneId, title: string): AppState {
  const space = s.spaces.find((sp) => sp.id === s.activeSpaceId);
  if (!space) return s;
  const tab = space.tabs.find((t) => t.id === space.activeTabId);
  if (!tab || !findLeaf(tab.root, paneId)) return s;
  const apply = (node: PaneNode): PaneNode => {
    if (node.kind === 'split') return { ...node, children: node.children.map(apply) };
    return node.kind === 'terminal' && node.id === paneId ? { ...node, title } : node;
  };
  return mapSpace(s, space.id, (sp) => ({
    ...sp,
    tabs: sp.tabs.map((t) => (t.id === tab.id ? { ...t, root: apply(t.root) } : t)),
  }));
}

// Replace editor leaf `paneId` with a fresh terminal (welcome chooser "Terminal").
// The terminal id is new; cwd is empty (a new session). Focus moves to it.
export function convertPaneToTerminal(s: AppState, paneId: PaneId): AppState {
  const space = s.spaces.find((sp) => sp.id === s.activeSpaceId);
  if (!space) return s;
  const tab = space.tabs.find((t) => t.id === space.activeTabId);
  if (!tab) return s;
  const target = findLeaf(tab.root, paneId);
  if (!target || target.kind !== 'editor') return s;
  const fresh = newLeaf();
  const apply = (node: PaneNode): PaneNode => {
    if (node.kind === 'split') return { ...node, children: node.children.map(apply) };
    return node.id === paneId ? fresh : node;
  };
  return mapSpace(s, space.id, (sp) => ({
    ...sp,
    tabs: sp.tabs.map((t) => (t.id === tab.id ? { ...t, root: apply(t.root), activePaneId: fresh.id } : t)),
  }));
}

// Change the mode of the ACTIVE file tab of editor leaf `paneId`. terminal/no active
// tab → no-op. mode round-trips through serialize (untouched).
export function setEditorMode(s: AppState, paneId: PaneId, mode: EditorMode): AppState {
  return mapEditorLeaf(s, paneId, (leaf) =>
    leaf.activeFileId === undefined ? leaf
      : { ...leaf, files: leaf.files.map((f) => (f.fileId === leaf.activeFileId ? { ...f, mode } : f)) });
}

// --- focusNeighbor (Plan 3c): directional pane focus via geometry ---------

export function focusNeighbor(s: AppState, dir: Dir): AppState {
  const space = s.spaces.find((sp) => sp.id === s.activeSpaceId);
  if (!space) return s;
  const tab = space.tabs.find((t) => t.id === space.activeTabId);
  if (!tab) return s;
  const target = neighbor(leafRects(tab.root), tab.activePaneId, dir);
  return target ? focusPane(s, target) : s;
}

// --- switchSpaceBy (Plan 3c): ⌘⌃←/→ space switch with wrap -----------------

export function switchSpaceBy(s: AppState, delta: number): AppState {
  const n = s.spaces.length;
  if (n <= 1) return s;
  const idx = s.spaces.findIndex((sp) => sp.id === s.activeSpaceId);
  if (idx === -1) return s;
  const next = (((idx + delta) % n) + n) % n; // wrap both directions (design §12.4)
  return setActiveSpace(s, s.spaces[next].id);
}

// --- moveTab (Plan 4c): tab DnD — moving between spaces and reordering within -----

// `toIndex` is the literal insertion index into the destination tabs array at insertion time
// (post-removal for reorder within the same space; index in the target when moving). App
// computes it from an id-based drop (see the plan's "Index convention").
export function moveTab(s: AppState, tabId: TabId, toSpaceId: SpaceId, toIndex: number): AppState {
  const fromSpace = s.spaces.find((sp) => sp.tabs.some((t) => t.id === tabId));
  if (!fromSpace) return s;                                   // unknown tab
  if (!s.spaces.some((sp) => sp.id === toSpaceId)) return s;  // unknown target space
  const fromIdx = fromSpace.tabs.findIndex((t) => t.id === tabId);
  const tab = fromSpace.tabs[fromIdx];

  // --- reorder within the same space (from === to) ---
  if (fromSpace.id === toSpaceId) {
    const rest = fromSpace.tabs.filter((t) => t.id !== tabId);
    const at = Math.max(0, Math.min(toIndex, rest.length));
    const tabs = [...rest];
    tabs.splice(at, 0, tab);
    // No-op (same ref): order, active tab and active space will not change.
    if (
      tabs.every((t, i) => t.id === fromSpace.tabs[i].id) &&
      s.activeSpaceId === toSpaceId &&
      fromSpace.activeTabId === tabId
    ) return s;
    const moved = mapSpace(s, fromSpace.id, (sp) => ({ ...sp, tabs, activeTabId: tabId }));
    return { ...moved, activeSpaceId: toSpaceId };
  }

  // --- move to a different space ---
  const rest = fromSpace.tabs.filter((t) => t.id !== tabId);
  let next: AppState;
  if (rest.length === 0) {
    next = removeSpace(s, fromSpace.id);          // source emptied → close it (one-tab-space rule)
  } else {
    const srcActive =
      fromSpace.activeTabId === tabId ? rest[Math.max(0, fromIdx - 1)].id : fromSpace.activeTabId;
    next = mapSpace(s, fromSpace.id, (sp) => ({ ...sp, tabs: rest, activeTabId: srcActive }));
  }
  const inserted = mapSpace(next, toSpaceId, (sp) => {
    const at = Math.max(0, Math.min(toIndex, sp.tabs.length));
    const tabs = [...sp.tabs];
    tabs.splice(at, 0, tab);
    return { ...sp, tabs, activeTabId: tabId };
  });
  return { ...inserted, activeSpaceId: toSpaceId };
}

// --- Sidebar (left panel): collapse/expand and set width ------------

// ui is read via readUi → defaults when the field did not exist yet (old layout.json).
export function toggleSidebar(s: AppState): AppState {
  const u = readUi(s);
  return { ...s, ui: { ...u, sidebarCollapsed: !u.sidebarCollapsed } };
}

export function setSidebarWidth(s: AppState, px: number): AppState {
  const u = readUi(s);
  return { ...s, ui: { ...u, sidebarWidth: clampSidebarWidth(px) } };
}

// --- Bottom panel (④): show/hide and set height ----------------------

export function toggleBottomPanel(s: AppState): AppState {
  const u = readUi(s);
  return { ...s, ui: { ...u, bottomPanelOpen: !u.bottomPanelOpen } };
}

export function setBottomPanelHeight(s: AppState, px: number): AppState {
  const u = readUi(s);
  return { ...s, ui: { ...u, bottomPanelHeight: clampBottomPanelHeight(px) } };
}

// --- Right area (③): show/hide and set width ----------------------

export function toggleRightArea(s: AppState): AppState {
  const u = readUi(s);
  return { ...s, ui: { ...u, rightAreaOpen: !u.rightAreaOpen } };
}

export function setRightAreaWidth(s: AppState, px: number): AppState {
  const u = readUi(s);
  return { ...s, ui: { ...u, rightAreaWidth: clampRightAreaWidth(px) } };
}

// --- movePane (Plan 4b): DnD move of a pane within the active tab -----------

// Write the new root of the active tab: the dragged pane is active, zoom is reset
// (the structure changed — a safe default, design §3.3/§10).
function writeTab(
  s: AppState, spaceId: SpaceId, tabId: TabId, root: PaneNode, activePaneId: PaneId,
): AppState {
  return mapSpace(s, spaceId, (sp) => ({
    ...sp,
    tabs: sp.tabs.map((t) =>
      t.id === tabId ? { ...t, root, activePaneId, zoomedPaneId: null } : t),
  }));
}

// Swap two leaves by id (whole nodes — cwd/title/paneId travel with the pane).
// The parents' positions/ratio are preserved.
function swapLeaves(root: PaneNode, idA: PaneId, idB: PaneId): PaneNode {
  const a = findLeaf(root, idA);
  const b = findLeaf(root, idB);
  if (!a || !b) return root;
  const replace = (node: PaneNode): PaneNode => {
    if (isLeaf(node)) {
      if (node.id === idA) return b;
      if (node.id === idB) return a;
      return node;
    }
    return { ...node, children: node.children.map(replace) };
  };
  return replace(root);
}

const sideToDir = (side: Side): 'h' | 'v' => (side === 'left' || side === 'right' ? 'v' : 'h');
const sideBefore = (side: Side): boolean => side === 'left' || side === 'top';

// Structural equality WITHOUT split ids and without ratio: compares kind/dir/number of
// children and leaf paneIds at the same positions. For the "dropped in the same position" no-op.
function sameShape(a: PaneNode, b: PaneNode): boolean {
  if (isLeaf(a) && isLeaf(b)) return a.id === b.id;
  if (a.kind === 'split' && b.kind === 'split') {
    return a.dir === b.dir
      && a.children.length === b.children.length
      && a.children.every((c, i) => sameShape(c, b.children[i]));
  }
  return false;
}

// Wrap/merge into the ROOT by side. If the root is a split of the same dir: flatten
// (the new one's share = the average of the existing ones, then renormalize). Otherwise
// wrap in a binary split with equal shares.
function insertOuter(root: PaneNode, side: Side, moving: Leaf): PaneNode {
  const dir = sideToDir(side);
  const before = sideBefore(side);
  if (root.kind === 'split' && root.dir === dir) {
    const children = before ? [moving, ...root.children] : [...root.children, moving];
    // Equal siblings → stay equal (1/N); otherwise average share + renormalize.
    let ratio: number[];
    if (allEqual(root.ratio)) {
      ratio = equalRatio(children.length);
    } else {
      const newShare = 1 / root.children.length;
      ratio = renormalize(before ? [newShare, ...root.ratio] : [...root.ratio, newShare]);
    }
    return { ...root, children, ratio };
  }
  return newSplit(dir, before ? [moving, root] : [root, moving]);
}

function findSplit(node: PaneNode, splitId: string): Split | null {
  if (isLeaf(node)) return null;
  if (node.id === splitId) return node;
  for (const c of node.children) {
    const f = findSplit(c, splitId);
    if (f) return f;
  }
  return null;
}

// Insert `moving` into split `splitId` at `index` (coordinates of the ORIGINAL tree). If
// the dragged one was a direct child of this split to the left of `index`, after detach
// the index shifts by −1. The new one's share = the average of the existing ones + renormalize.
// {ok:false} if the split is not found (collapsed on detach).
function insertAtDivider(
  afterRoot: PaneNode, splitId: string, index: number, originalRoot: PaneNode, dragId: PaneId, moving: Leaf,
): { node: PaneNode; ok: boolean } {
  let adj = index;
  const orig = findSplit(originalRoot, splitId);
  if (orig) {
    // Only a direct child of the split can shift the index; nested deeper → p === -1, no shift.
    const p = orig.children.findIndex((c) => isLeaf(c) && c.id === dragId);
    if (p !== -1 && p < index) adj = index - 1;
  }
  const apply = (node: PaneNode): { node: PaneNode; ok: boolean } => {
    if (isLeaf(node)) return { node, ok: false };
    if (node.id === splitId) {
      const at = Math.max(0, Math.min(adj, node.children.length));
      const children = [...node.children];
      children.splice(at, 0, moving);
      // Equal siblings → stay equal (1/N); otherwise average share + renormalize.
      let ratio: number[];
      if (allEqual(node.ratio)) {
        ratio = equalRatio(children.length);
      } else {
        const newShare = 1 / node.children.length; // average of the existing ones (before insert)
        const next = [...node.ratio];
        next.splice(at, 0, newShare);
        ratio = renormalize(next);
      }
      return { node: { ...node, children, ratio }, ok: true };
    }
    for (let i = 0; i < node.children.length; i++) {
      const res = apply(node.children[i]);
      if (res.ok) {
        const children = [...node.children];
        children[i] = res.node;
        return { node: { ...node, children }, ok: true };
      }
    }
    return { node, ok: false };
  };
  return apply(afterRoot);
}

// Insert `moving` next to leaf `targetId`. The target's direct parent is a split of the
// same `dir`: flatten (insert as a sibling, halve the target's share). Otherwise wrap the
// target in a new binary split. before=left/top → before the target. {ok:false} if the target is not found.
function insertBeside(
  node: PaneNode, targetId: PaneId, side: Side, moving: Leaf,
): { node: PaneNode; ok: boolean } {
  const dir = sideToDir(side);
  const before = sideBefore(side);
  if (isLeaf(node)) {
    if (node.id !== targetId) return { node, ok: false };
    return { node: newSplit(dir, before ? [moving, node] : [node, moving]), ok: true };
  }
  const idx = node.children.findIndex((c) => isLeaf(c) && c.id === targetId);
  if (idx !== -1) {
    if (node.dir === dir) {
      const children = [...node.children];
      children.splice(before ? idx : idx + 1, 0, moving);
      // Equal siblings → stay equal (1/N); otherwise halve the target's share.
      let ratio: number[];
      if (allEqual(node.ratio)) {
        ratio = equalRatio(children.length);
      } else {
        ratio = [...node.ratio];
        const share = node.ratio[idx];
        ratio.splice(idx, 1, share / 2, share / 2);
      }
      return { node: { ...node, children, ratio }, ok: true };
    }
    const child = node.children[idx] as Leaf;
    const wrapped = newSplit(dir, before ? [moving, child] : [child, moving]);
    const children = [...node.children];
    children[idx] = wrapped;
    return { node: { ...node, children }, ok: true };
  }
  for (let i = 0; i < node.children.length; i++) {
    const res = insertBeside(node.children[i], targetId, side, moving);
    if (res.ok) {
      const children = [...node.children];
      children[i] = res.node;
      return { node: { ...node, children }, ok: true };
    }
  }
  return { node, ok: false };
}

export function movePane(s: AppState, dragId: PaneId, target: DropTarget): AppState {
  const space = s.spaces.find((sp) => sp.id === s.activeSpaceId);
  if (!space) return s;
  const tab = space.tabs.find((t) => t.id === space.activeTabId);
  if (!tab) return s;
  const root = tab.root;
  const dragLeaf = findLeaf(root, dragId);
  if (!dragLeaf) return s;                       // unknown pane
  if (isLeaf(root)) return s;       // the tab's single pane — nothing to rearrange

  if (target.kind === 'swap') {
    if (target.leafId === dragId) return s;     // onto itself
    if (!findLeaf(root, target.leafId)) return s;
    return writeTab(s, space.id, tab.id, swapLeaves(root, dragId, target.leafId), dragId);
  }

  if (target.kind === 'edge' && target.leafId === dragId) return s; // onto itself

  // edge/divider/outer: detach the dragged one → insert into the updated tree.
  const detached = removeLeaf(root, dragId);
  if (!detached.found) return s;                   // defensive (for edge always found; serves divider/outer, Tasks 4–5)
  const moving: Leaf = { ...dragLeaf };
  const afterRoot = detached.node;

  let inserted: { node: PaneNode; ok: boolean };
  if (target.kind === 'edge') {
    inserted = insertBeside(afterRoot, target.leafId, target.side, moving);
  } else if (target.kind === 'outer') {
    inserted = { node: insertOuter(afterRoot, target.side, moving), ok: true };
  } else {
    inserted = insertAtDivider(afterRoot, target.splitId, target.index, root, dragId, moving);
  }
  if (!inserted.ok) return s;                       // target vanished after detach → no-op (divider — Task 5)
  if (sameShape(inserted.node, root)) return s;     // dropped in the same position → no-op
  return writeTab(s, space.id, tab.id, inserted.node, dragId);
}

// Bring the active tab to an exact cols×rows grid of consoles. Existing leaves
// (sessions) are preserved; the missing ones are added up to cols*rows. If there
// are already as many or more — no-op (we close nothing). Zoom is reset.
export function gridConsoles(s: AppState, cols: number, rows: number): AppState {
  const { cols: c, rows: r } = clampGrid(cols, rows);
  const target = c * r;
  const space = s.spaces.find((sp) => sp.id === s.activeSpaceId);
  if (!space) return s;
  const tab = space.tabs.find((t) => t.id === space.activeTabId);
  if (!tab) return s;
  const existing = collectLeaves(tab.root);
  if (existing.length >= target) return s; // no-op, sessions intact
  const fresh = Array.from({ length: target - existing.length }, () => newLeaf());
  const root = buildGrid([...existing, ...fresh], c, r);
  return mapSpace(s, space.id, (sp) => ({
    ...sp,
    tabs: sp.tabs.map((t) =>
      t.id === tab.id ? { ...t, root, activePaneId: fresh[0].id, zoomedPaneId: null } : t,
    ),
  }));
}

// Alert color choice (a setting) — persisted in ui together with the layout.
export function setAlertColor(s: AppState, v: ColorValue): AppState {
  return { ...s, ui: { ...readUi(s), alertColor: v } };
}

// — appearance settings (persisted in ui together with the layout) ----------------
export function setActiveColor(s: AppState, v: ColorValue): AppState {
  return { ...s, ui: { ...readUi(s), activeColor: v } };
}
export function setExitColor(s: AppState, v: ColorValue): AppState {
  return { ...s, ui: { ...readUi(s), exitColor: v } };
}
export function setUiFont(s: AppState, key: FontKey): AppState {
  return { ...s, ui: { ...readUi(s), uiFont: key } };
}
export function setUiFontSize(s: AppState, px: number): AppState {
  return { ...s, ui: { ...readUi(s), uiFontSize: clampFontSize(px) } };
}
export function setTermFontSize(s: AppState, px: number): AppState {
  return { ...s, ui: { ...readUi(s), termFontSize: clampFontSize(px) } };
}
export function setEditorFontSize(s: AppState, px: number): AppState {
  return { ...s, ui: { ...readUi(s), editorFontSize: clampFontSize(px) } };
}
// Active UI language (persisted in ui together with the layout).
export function setLocalePref(s: AppState, l: string): AppState {
  return { ...s, ui: { ...readUi(s), locale: l } };
}
// Reset all appearance settings to defaults (the Reset button).
export function resetAppearance(s: AppState): AppState {
  return {
    ...s,
    ui: {
      ...readUi(s),
      activeColor: ACTIVE_DEFAULT, exitColor: EXIT_DEFAULT, alertColor: DEFAULT_ALERT_COLOR,
      uiFont: FONT_DEFAULT, uiFontSize: FONT_SIZE_DEFAULT,
      termFontSize: FONT_SIZE_DEFAULT, editorFontSize: FONT_SIZE_DEFAULT,
    },
  };
}

// --- moveLeafToNav: move a console (leaf) to another tab/space (DnD pane→navigator) ---
// Source = the active tab (only a mounted pane can be dragged). The Leaf object itself
// (paneId/cwd/title) is moved → the Go session stays alive, the target tab replays on activation (§9).
export function moveLeafToNav(s: AppState, dragId: PaneId, target: NavMoveTarget): AppState {
  const srcSpace = s.spaces.find((sp) => sp.id === s.activeSpaceId);
  if (!srcSpace) return s;
  const srcTab = srcSpace.tabs.find((t) => t.id === srcSpace.activeTabId);
  if (!srcTab) return s;
  const leaf = findLeaf(srcTab.root, dragId);
  if (!leaf) return s;                                  // dragId not in the active tab

  const tgtSpace = s.spaces.find((sp) => sp.id === target.spaceId);
  if (!tgtSpace) return s;                              // no target space
  if (target.kind === 'tab' && !tgtSpace.tabs.some((t) => t.id === target.tabId)) return s;

  if (target.kind === 'tab' && target.tabId === srcTab.id) return s;   // drop onto its own tab → no-op
  if (target.kind === 'space' && target.spaceId === srcSpace.id && isLeaf(srcTab.root)) {
    return s;                                          // a single console onto its own space → nowhere to move
  }

  const moving: Leaf = { ...leaf };                     // the same id/cwd/title travels (§9)

  // --- detach from the source (= the active tab) ---
  let detached: AppState;
  if (isLeaf(srcTab.root)) {
    detached = closeTab(s, srcSpace.id, srcTab.id);     // a single console → the tab empties (removeSpace cascade)
  } else {
    const res = removeLeaf(srcTab.root, dragId);
    const root = res.node;
    const activePaneId =
      srcTab.activePaneId === dragId ? (res.focusId ?? firstLeaf(root).id) : srcTab.activePaneId;
    const zoomedPaneId = srcTab.zoomedPaneId === dragId ? null : srcTab.zoomedPaneId;
    detached = mapSpace(s, srcSpace.id, (sp) => ({
      ...sp,
      tabs: sp.tabs.map((t) => (t.id === srcTab.id ? { ...t, root, activePaneId, zoomedPaneId } : t)),
    }));
  }

  // --- insert into the target + follow ---
  if (target.kind === 'tab') {
    const withInsert = mapSpace(detached, target.spaceId, (sp) => ({
      ...sp,
      tabs: sp.tabs.map((t) => {
        if (t.id !== target.tabId) return t;
        // Re-tile: the brought-in console merges as an EQUAL cell into a balanced
        // grid (rather than being glued as a half-size wrapper — bug #1). §9: the leaves'
        // id/cwd are preserved (existing ones are the same Leaf objects, the brought-in one is a clone with the same id).
        const leaves = [...collectLeaves(t.root), moving];
        const { cols, rows } = autoGridDims(leaves.length);
        return { ...t, root: buildGrid(leaves, cols, rows), activePaneId: dragId, zoomedPaneId: null };
      }),
      activeTabId: target.tabId,
    }));
    return { ...withInsert, activeSpaceId: target.spaceId };
  }
  const newTabNode: Tab = {
    id: crypto.randomUUID(), title: 'shell', activePaneId: dragId, zoomedPaneId: null, root: moving,
  };
  const withInsert = mapSpace(detached, target.spaceId, (sp) => ({
    ...sp,
    tabs: [...sp.tabs, newTabNode],
    activeTabId: newTabNode.id,
  }));
  return { ...withInsert, activeSpaceId: target.spaceId };
}
