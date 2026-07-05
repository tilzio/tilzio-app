import { type AppState, initialState, type PaneId, type SpaceId, type TabId } from './types';
import * as R from './reducers';
import { serialize, loadOrDefault } from './serialize';
import { debounce } from './autosave';
import { coreBridge } from '../bridge/core';
import type { Dir } from './paneGeometry';
import type { DropTarget } from './dropZone';

// Svelte-5 reactive holder. Components read `store.app`; all mutations go through
// `actions`, which apply a pure reducer then schedule a debounced autosave.
export const store = $state<{ app: AppState }>({ app: initialState() });

const saver = debounce(() => {
  void coreBridge.saveLayout(serialize(store.app));
}, 500);

function commit(next: AppState): void {
  store.app = next;
  saver.schedule();
}

// Load persisted layout at startup (default on missing/corrupt).
export async function initStore(): Promise<void> {
  store.app = loadOrDefault(await coreBridge.loadLayout());
}

// Force a final save (call on app exit / beforeunload).
export function flushSave(): void {
  saver.flush();
}

export const actions = {
  addSpace: (name?: string) => commit(R.addSpace(store.app, name)),
  removeSpace: (id: SpaceId) => commit(R.removeSpace(store.app, id)),
  renameSpace: (id: SpaceId, name: string) => commit(R.renameSpace(store.app, id, name)),
  toggleCollapsed: (id: SpaceId) => commit(R.toggleCollapsed(store.app, id)),
  setActiveSpace: (id: SpaceId) => commit(R.setActiveSpace(store.app, id)),
  addTab: (spaceId: SpaceId, title?: string) => commit(R.addTab(store.app, spaceId, title)),
  closeTab: (spaceId: SpaceId, tabId: TabId) => commit(R.closeTab(store.app, spaceId, tabId)),
  renameTab: (spaceId: SpaceId, tabId: TabId, title: string) =>
    commit(R.renameTab(store.app, spaceId, tabId, title)),
  setActiveTab: (spaceId: SpaceId, tabId: TabId) => commit(R.setActiveTab(store.app, spaceId, tabId)),
  splitPane: (paneId: PaneId, dir: 'h' | 'v') => commit(R.splitPane(store.app, paneId, dir)),
  closePane: (paneId: PaneId) => commit(R.closePane(store.app, paneId)),
  setRatio: (splitId: string, ratios: number[]) => commit(R.setRatio(store.app, splitId, ratios)),
  setZoom: (tabId: TabId, paneId: PaneId | null) => commit(R.setZoom(store.app, tabId, paneId)),
  focusPane: (paneId: PaneId) => commit(R.focusPane(store.app, paneId)),
  setPaneTitle: (paneId: PaneId, title: string) => commit(R.setPaneTitle(store.app, paneId, title)),
  setEditorMode: (paneId: PaneId, mode: import('./types').EditorMode) =>
    commit(R.setEditorMode(store.app, paneId, mode)),
  movePane: (dragId: PaneId, target: DropTarget) => commit(R.movePane(store.app, dragId, target)),
  moveLeafToNav: (dragId: PaneId, target: import('./types').NavMoveTarget) =>
    commit(R.moveLeafToNav(store.app, dragId, target)),
  moveTab: (tabId: TabId, toSpaceId: SpaceId, toIndex: number) =>
    commit(R.moveTab(store.app, tabId, toSpaceId, toIndex)),
  reorderSpace: (id: SpaceId, toIndex: number) => commit(R.reorderSpace(store.app, id, toIndex)),
  focusNeighbor: (dir: Dir) => commit(R.focusNeighbor(store.app, dir)),
  switchSpaceBy: (delta: number) => commit(R.switchSpaceBy(store.app, delta)),
  toggleSidebar: () => commit(R.toggleSidebar(store.app)),
  setSidebarWidth: (px: number) => commit(R.setSidebarWidth(store.app, px)),
  toggleBottomPanel: () => commit(R.toggleBottomPanel(store.app)),
  setBottomPanelHeight: (px: number) => commit(R.setBottomPanelHeight(store.app, px)),
  toggleRightArea: () => commit(R.toggleRightArea(store.app)),
  setRightAreaWidth: (px: number) => commit(R.setRightAreaWidth(store.app, px)),
  splitAsEditor: (paneId: PaneId, dir: 'h' | 'v') => commit(R.splitAsEditor(store.app, paneId, dir)),
  openFileInPane: (paneId: PaneId, path: string) => commit(R.openFileInPane(store.app, paneId, path)),
  openFileInNewSplit: (paneId: PaneId, path: string, dir: 'h' | 'v') => commit(R.openFileInNewSplit(store.app, paneId, path, dir)),
  closeEditorFile: (paneId: PaneId, fileId: string) => commit(R.closeEditorFile(store.app, paneId, fileId)),
  setActiveEditorFile: (paneId: PaneId, fileId: string) => commit(R.setActiveEditorFile(store.app, paneId, fileId)),
  convertPaneToTerminal: (paneId: PaneId) => commit(R.convertPaneToTerminal(store.app, paneId)),
  openPluginView: (pluginId: string, viewId: string) => commit(R.openPluginView(store.app, pluginId, viewId)),
  gridConsoles: (cols: number, rows: number) => commit(R.gridConsoles(store.app, cols, rows)),
  setAlertColor: (v: import('./appearance').ColorValue) => commit(R.setAlertColor(store.app, v)),
  setActiveColor: (v: import('./appearance').ColorValue) => commit(R.setActiveColor(store.app, v)),
  setExitColor: (v: import('./appearance').ColorValue) => commit(R.setExitColor(store.app, v)),
  setUiFont: (k: import('./appearance').FontKey) => commit(R.setUiFont(store.app, k)),
  setUiFontSize: (px: number) => commit(R.setUiFontSize(store.app, px)),
  setTermFontSize: (px: number) => commit(R.setTermFontSize(store.app, px)),
  setEditorFontSize: (px: number) => commit(R.setEditorFontSize(store.app, px)),
  setLocalePref: (l: string) => commit(R.setLocalePref(store.app, l)),
  resetAppearance: () => commit(R.resetAppearance(store.app)),
};
