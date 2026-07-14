<script lang="ts">
  import { onMount } from 'svelte';
  import NavigatorTree from './components/NavigatorTree.svelte';
  import Breadcrumb from './components/Breadcrumb.svelte';
  import ActivityBar from './components/ActivityBar.svelte';
  import SplitContainer from './components/SplitContainer.svelte';
  import { store, actions, initStore, flushSave } from './state/store.svelte';
  import { t, initLocale, setLocale, type Locale } from './i18n/index.svelte';
  import { navigatorRows, breadcrumbParts, activeTab, leafIds, terminalCount, editorOpenTarget, findLeaf, editorFilesIn, openedFileId, locatePane } from './state/selectors';
  import type { NavRow } from './state/selectors';
  import { files } from './bridge/files';
  import { restoreDrafts } from './bridge/draftRestore';
  import { editorBuffers, markSaveFailed } from './bridge/editorBuffers.svelte';
  import { editorDirty } from './bridge/editorDirty.svelte';
  import { pendingGoto } from './bridge/pendingGoto.svelte';
  import type { PaneNode } from './state/types';
  import { resolveHotkey, type HotkeyAction } from './state/keymap';
  import { paneRestart } from './bridge/paneRestart';
  import ConfirmDialog from './components/ConfirmDialog.svelte';
  import PerimeterDrop from './components/PerimeterDrop.svelte';
  import { touchedPanes } from './bridge/touchedPanes';
  import { shouldConfirmClose, dirtyEditorFiles, unsavedCloseMessage } from './state/closeConfirm';
  import SidebarResizer from './components/SidebarResizer.svelte';
  import { readUi, SIDEBAR_DEFAULT, ACTIVITY_BAR_WIDTH } from './state/sidebar';
  import StatusBar from './components/StatusBar.svelte';
  import BottomPanel from './components/BottomPanel.svelte';
  import { BOTTOM_PANEL_DEFAULT, STATUS_BAR_HEIGHT } from './state/bottomPanel';
  import SettingsDialog from './components/SettingsDialog.svelte';
  import PluginToast from './components/PluginToast.svelte';
  import RightAreaResizer from './components/RightAreaResizer.svelte';
  import PluginAccordion from './components/PluginAccordion.svelte';
  import { rightAccordion, openRightPanel, closeRightPanel, toggleRightCollapsed, pruneRightPanels } from './bridge/rightAccordion.svelte';
  import ExtensionsScreen from './components/ExtensionsScreen.svelte';
  import PluginDetail from './components/PluginDetail.svelte';
  import PermissionConsentDialog from './components/PermissionConsentDialog.svelte';
  import InstallDialog from './components/InstallDialog.svelte';
  import FinderDropOverlay from './components/FinderDropOverlay.svelte';
  import { installBytes, installUrl, uninstallPlugin } from './bridge/pluginInstall';
  import { pluginsBridge, type PluginInfo, type ConflictInfo, type StorageInfo, type PluginManifest } from './bridge/plugins';
  import { enablePlugin, disablePlugin, resetPluginStorage } from './bridge/pluginManage';
  import StoreCard from './components/StoreCard.svelte';
  import { storeInstall } from './bridge/storeActions';
  import type { StoreEntry, StoreDetail, UpdateInfo, Catalog } from './bridge/plugins';
  import { declaredPermissions, resolvePermission, needsConsent, type PermLabel } from './state/permissionLabels';
  import { init as initPluginHost, terminateAll as terminatePlugins, pluginHost, sendUiEvent, broadcastStateChanged, activate, deactivate } from './bridge/pluginHost.svelte';
  import { stateSnapshot } from './state/pluginState';
  import { parseOpens } from './state/pluginOpens';
  import { RIGHT_AREA_DEFAULT } from './state/rightArea';
  import { statusBarItems, breadcrumbItems, activityBarButtons, panelsFor, type PluginView } from './state/pluginSlots';
  import { pluginPanels, setActivePanel, activePanelId, decideActivation } from './bridge/pluginPanels.svelte';
  import { Events } from '@wailsio/runtime';
  import { alerts, clearAlerts, recordBell } from './bridge/alerts.svelte';
  import {
    resolveColor, fontStack,
    ACTIVE_DEFAULT_HEX, EXIT_DEFAULT_HEX, ALERT_DEFAULT_HEX, FONT_DEFAULT, FONT_SIZE_DEFAULT,
  } from './state/appearance';
  import { tabAlertCount, spaceAlertCount, collectLeaves } from './state/selectors';
  import { isExited, exitedPanes } from './bridge/exitedPanes.svelte';
  import { runningCount, alertCount } from './state/statusCounts';
  import { tabStatus, spaceStatus, navStatus, type PaneStatus } from './state/paneStatus';
  import { buildBellToast, staleBellPanes } from './state/bellToast';
  import { pushActionToast, dismissToast, toasts } from './bridge/toast.svelte';

  let ready = $state(false);
  let pendingConfirm = $state<{ message: string; confirmLabel?: string; onConfirm: () => void } | null>(null);
  let settingsOpen = $state(false);
  let extensionsOpen = $state(false);
  let extPlugins = $state<PluginInfo[]>([]);
  let extDetailId = $state<string | null>(null);
  let detailStorage = $state<StorageInfo | null>(null);
  let pendingConsent = $state<PluginInfo | null>(null);
  let busyId = $state<string | null>(null);

  // Extension store (spec §5.2). Catalog/updates live here so both the Store tab
  // and the Installed badges see one source of truth.
  let extTab = $state<'installed' | 'store'>('installed');
  let storeCatalog = $state<Catalog | null>(null);
  let storeLoading = $state(false);
  let storeError = $state('');
  let storeBusyId = $state<string | null>(null);
  let storeActionError = $state('');
  let updates = $state<Record<string, UpdateInfo>>({});
  let storeDetailId = $state<string | null>(null);
  let storeDetailData = $state<StoreDetail | null>(null);
  let storeDetailErr = $state('');
  // Consent for a store UPDATE that grows permissions (auto-update refused it).
  let pendingStoreConsent = $state<{ entry: StoreEntry; update: UpdateInfo } | null>(null);
  let autoUpdateExt = $state(true);

  const storeEntries = $derived<StoreEntry[]>(storeCatalog?.extensions ?? []);
  const storeDetailEntry = $derived<StoreEntry | undefined>(
    storeDetailId === null ? undefined : storeEntries.find((e) => e.id === storeDetailId)
  );
  // Plain function: it reads extPlugins ($state) at call time inside the template,
  // so reactivity flows through the render effect — no $derived wrapper needed.
  function installedVersionFor(id: string): string {
    return extPlugins.find((p) => p.manifest?.id === id)?.manifest?.version ?? '';
  }
  const storeConsentPerms = $derived<PermLabel[]>(
    pendingStoreConsent
      ? (pendingStoreConsent.entry.permissions ?? []).map((p) =>
          resolvePermission(p, pendingStoreConsent!.entry.exec ?? [])
        )
      : []
  );

  let installOpen = $state(false);
  let installStatus = $state<'idle' | 'busy' | 'error' | 'conflict'>('idle');
  let installError = $state('');
  let installConflict = $state<ConflictInfo | null>(null);
  // Resolver for the pending conflict question (true=replace / false=cancel). Not $state —
  // it's a control reference, not render data.
  let conflictResolve: ((ok: boolean) => void) | null = null;
  // drag-from-Finder overlay (#2): true while a cursor with a file is over the window.
  let finderDragOver = $state(false);
  // Anti-duplicate for T2 toasts: one toast per pane (paneId → toastId).
  const bellToasts = new Map<string, number>();

  // Clean up the bellToasts anti-duplicate map when a T2 toast leaves by any path (✕/Later/programmatically):
  // ✕ calls dismissToast directly, bypassing the close() closure, so we rely on toasts.items.
  $effect(() => {
    const live = new Set(toasts.items.map((t) => t.id));
    for (const p of staleBellPanes(bellToasts, live)) bellToasts.delete(p);
  });

  // Focus a pane via §9-safe reducers — without killing the PTY.
  function focusPaneAcross(loc: { spaceId: string; tabId: string; paneId: string }) {
    actions.setActiveSpace(loc.spaceId);
    actions.setActiveTab(loc.spaceId, loc.tabId);
    actions.focusPane(loc.paneId);
  }

  const consentPerms = $derived<PermLabel[]>(
    pendingConsent?.manifest
      ? declaredPermissions(pendingConsent.manifest).map((p) => resolvePermission(p, pendingConsent!.manifest!.exec ?? []))
      : []
  );

  const rows = $derived(navigatorRows(store.app));
  const parts = $derived(breadcrumbParts(store.app));
  const ui = $derived(readUi(store.app));
  const tab = $derived(activeTab(store.app));
  const pluginViews = $derived<PluginView[]>(pluginHost.active.map((p) => ({ id: p.id, contributes: p.contributes, ui: p.ui })));
  const sbItems = $derived(statusBarItems(pluginViews));
  const bcItems = $derived(breadcrumbItems(pluginViews));
  const abButtons = $derived(activityBarButtons(pluginViews));
  const bottomPanels = $derived(panelsFor(pluginViews, 'bottom'));
  const rightPanels = $derived(panelsFor(pluginViews, 'right'));
  const openRightPanels = $derived(
    rightAccordion.open
      .map((id) => rightPanels.find((p) => p.id === id))
      .filter((p): p is (typeof rightPanels)[number] => p !== undefined),
  );
  // Reactive stale-id prune: when a plugin contributing a right panel is disabled/removed
  // while its panel is open, its id lingers in rightAccordion.open. Prune it, and if that
  // empties the right area while it's open, close it. Read rightPanels FIRST so the effect
  // subscribes to it before pruneRightPanels mutates state (pruneRightPanels is idempotent,
  // so re-running with the same validIds converges — no infinite loop).
  $effect(() => {
    const validIds = rightPanels.map((p) => p.id);
    pruneRightPanels(validIds);
    if ((ui.rightAreaOpen ?? false) && rightAccordion.open.length === 0) actions.toggleRightArea();
  });
  // Outer remount key: switching space/tab remounts the whole subtree (triggers
  // scrollback replay on the newly visible panes; §9).
  const tabKey = $derived(`${store.app.activeSpaceId}:${tab?.id ?? ''}`);
  const consoleCount = $derived(terminalCount(store.app));
  const activePath = $derived(parts.join(' › '));

  // S1.6: aggregate counters for the status bar (rendering is S4; here it's only data assembly).
  const runningTotal = $derived(runningCount(store.app, isExited));
  const alertTotal = $derived(alertCount(store.app, alerts.counts));

  function rowAlertCount(row: NavRow): number {
    const space = store.app.spaces.find((s) => s.id === row.spaceId);
    if (!space) return 0;
    if (row.kind === 'tab') {
      const tab = space.tabs.find((t) => t.id === row.tabId);
      return tab ? tabAlertCount(alerts.counts, tab) : 0;
    }
    return spaceAlertCount(alerts.counts, space);
  }

  // S1.6 + S3.3: navigator row status — all 5 states (active/alert/exited/running/idle).
  // Reactivity point: we read exitedPanes.codes ($state mirror) and alerts.counts ($state) —
  // Svelte 5 subscribes the effect/derived when this function is called from {#each}.
  function rowStatus(row: NavRow): PaneStatus {
    const space = store.app.spaces.find((s) => s.id === row.spaceId);
    if (!space) return 'idle';
    if (row.kind === 'tab') {
      const tabItem = space.tabs.find((t) => t.id === row.tabId);
      if (!tabItem) return 'idle';
      const leaves = collectLeaves(tabItem.root);
      const ids = leaves.map((l) => l.id);
      const isActive = space.id === store.app.activeSpaceId && tabItem.id === space.activeTabId;
      // running = a terminal leaf without an exit record — REACTIVELY via exitedPanes.codes ($state),
      // NOT via ptyEvents.isLive() (liveSet is not reactive → the idle→running transition "freezes", spec §3.3).
      // Mirrors the runningCount() logic: kind==='terminal' && !isExited.
      const runningIds = new Set(
        leaves.filter((l) => l.kind === 'terminal' && !isExited(l.id)).map((l) => l.id),
      );
      return navStatus(
        { kind: 'tab', active: isActive },
        {
          alertCount: tabAlertCount(alerts.counts, tabItem),
          leafIds: ids,
          exited: exitedPanes.codes,  // $state — reactive source
          isLive: (id) => runningIds.has(id),
        },
      );
    }
    // kind === 'space': aggregate over the active tab (spaceStatus without running)
    const activeTabItem = space.tabs.find((t) => t.id === space.activeTabId);
    const activePaneId =
      space.id === store.app.activeSpaceId && activeTabItem
        ? activeTabItem.activePaneId
        : null;
    return spaceStatus(space, { activePaneId, alertCounts: alerts.counts, isExited });
  }

  function handleZoom(paneId: string) {
    if (!tab) return;
    actions.setZoom(tab.id, tab.zoomedPaneId === paneId ? null : paneId);
  }

  // Confirm a destructive close only when it loses more than one terminal, or any
  // terminal the user has typed into (don't lose active work). Otherwise run now.
  function requestClose(message: string, ids: string[], action: () => void) {
    const doAction = () => { ids.forEach((id) => clearAlerts(id)); action(); };
    if (shouldConfirmClose(ids, (id) => touchedPanes.isTouched(id))) {
      pendingConfirm = { message, onConfirm: () => { pendingConfirm = null; doAction(); } };
    } else {
      doAction();
    }
  }

  // ⌘O per the §5.5 rule: open the file in the active editor or in a new split.
  async function openFile() {
    const path = await files.openFileDialog();
    if (!path) return;
    openPathSomewhere(path);
  }
  function openPathSomewhere(path: string, line?: number, col?: number) {
    if (!tab) return;
    const target = editorOpenTarget(tab.root, tab.activePaneId);
    if (target) actions.openFileInPane(target.id, path);
    else actions.openFileInNewSplit(tab.activePaneId, path, 'v');
    if (line == null) return;
    // commit is synchronous → the active leaf of the active tab is already = the opened editor leaf.
    const fileId = openedFileId(store.app);
    if (fileId) pendingGoto.set(fileId, { line, col });
  }
  function openFileForPane(paneId: string) {      // welcome card / «+» : into this editor pane
    void (async () => { const p = await files.openFileDialog(); if (p) actions.openFileInPane(paneId, p); })();
  }
  function openFileSplitFrom(paneId: string, dir: 'h' | 'v') { // split menu "Open file…": in a new split
    void (async () => { const p = await files.openFileDialog(); if (p) actions.openFileInNewSplit(paneId, p, dir); })();
  }

  const baseName = (p: string) => p.split('/').pop() || p;

  // ⌘S: write the active editor file from the fresh buffer, clear the ● and erase the draft.
  async function saveActiveEditor() {
    if (!tab) return;
    const leaf = findLeaf(tab.root, tab.activePaneId);
    if (!leaf || leaf.kind !== 'editor' || !leaf.activeFileId) return;
    const fileId = leaf.activeFileId;
    if (!editorDirty.get(fileId)) return;                 // clean → nothing to save (don't overwrite the file with '')
    const file = leaf.files.find((f) => f.fileId === fileId);
    const buf = editorBuffers.get(fileId);
    if (!file || !buf) return;                            // no buffer → NEVER write '' (data-loss guard)
    editorDirty.set(fileId, false);                       // ● off immediately (reactively)
    editorBuffers.set(fileId, { ...buf, dirty: false });  // buffer is consistent → no ● after remount
    try {
      await files.writeFile(file.path, buf.doc);
      await files.clearDraft(fileId);
    } catch {
      editorDirty.set(fileId, true);                      // write failed — restore "dirty"
      // Re-read the CURRENT buffer: writing back the pre-await `buf` would roll
      // back text the user typed while writeFile was in flight.
      markSaveFailed(fileId);
    }
  }

  // Completely forget editor files (permanent close): erase draft + buffer + dirty.
  // purge (not delete) tombstones the id so a still-mounted EditorFileBody.onDestroy
  // doesn't resurrect the buffer on its final flush (per-closed-file memory leak).
  function purgeEditorFiles(fs: { fileId: string }[]) {
    fs.forEach((f) => {
      void files.clearDraft(f.fileId);
      editorBuffers.purge(f.fileId);
      editorDirty.delete(f.fileId);
    });
  }

  // Close ONE editor tab (✕ on the chip / ⌘W). Dirty → ConfirmDialog.
  function closeEditorTab(paneId: string, fileId: string) {
    if (!tab) return;
    const leaf = findLeaf(tab.root, paneId);
    const file = leaf && leaf.kind === 'editor' ? leaf.files.find((f) => f.fileId === fileId) : undefined;
    const doClose = () => {
      actions.closeEditorFile(paneId, fileId);
      purgeEditorFiles([{ fileId }]);
    };
    if (editorDirty.get(fileId)) {
      pendingConfirm = {
        message: unsavedCloseMessage([file ? baseName(file.path) : t('dialog.fileFallback')]),
        confirmLabel: t('dialog.discard'),
        onConfirm: () => { pendingConfirm = null; doClose(); },
      };
    } else {
      doClose();
    }
  }

  // Close a subtree (pane/tab/space): first the unsaved-editors guard,
  // otherwise the existing terminal heuristic. On confirmation — purge editor files.
  function requestCloseRoots(fallbackMessage: string, roots: PaneNode[], ids: string[], action: () => void) {
    const eFiles = roots.flatMap((r) => editorFilesIn(r));
    const dirty = dirtyEditorFiles(eFiles, (id) => editorDirty.get(id));
    const act = () => { purgeEditorFiles(eFiles); action(); };
    if (dirty.length > 0) {
      pendingConfirm = {
        message: unsavedCloseMessage(dirty.map((f) => baseName(f.path))),
        confirmLabel: t('dialog.discard'),
        onConfirm: () => { pendingConfirm = null; ids.forEach((id) => clearAlerts(id)); act(); },
      };
    } else {
      requestClose(fallbackMessage, ids, act);
    }
  }

  function closePaneById(paneId: string) {
    if (!tab) return;
    const leaf = findLeaf(tab.root, paneId);
    if (!leaf) return;
    requestCloseRoots(t('dialog.closeTerminal'), [leaf], [paneId], () => actions.closePane(paneId));
  }

  function pluginCommand(pluginId: string, command: string, args?: unknown) {
    sendUiEvent(pluginId, { type: 'command', command, args });
  }
  // Model A: click on a plugin icon in the Activity Bar.
  function openPluginPanel(pluginId: string, opens: string) {
    const parsed = parseOpens(opens);
    if (parsed.kind === 'view') { actions.openPluginView(pluginId, parsed.target); return; }
    const right = rightPanels.find((p) => p.id === opens);
    if (right) {
      if (!(ui.rightAreaOpen ?? false)) actions.toggleRightArea();
      openRightPanel(opens);
      return;
    }
    const isOpen = ui.bottomPanelOpen ?? false;
    const decision = decideActivation(isOpen, activePanelId('bottom'), opens);
    if (decision.toggleArea) actions.toggleBottomPanel();
    setActivePanel('bottom', decision.setActive);
  }

  function openInstall() {
    installStatus = 'idle'; installError = ''; installConflict = null; conflictResolve = null;
    installOpen = true;
  }
  function closeInstall() {
    conflictResolve?.(false); conflictResolve = null; // reject the pending conflict, if any
    installOpen = false; installStatus = 'idle'; installError = ''; installConflict = null;
  }
  // onConflict for the orchestrator: show "vX→vY?" and wait for the user's button.
  function askConflict(c: ConflictInfo): Promise<boolean> {
    installConflict = c; installStatus = 'conflict';
    return new Promise<boolean>((resolve) => { conflictResolve = resolve; });
  }
  async function runInstall(run: () => Promise<{ installed: boolean }>) {
    installStatus = 'busy'; installError = '';
    try {
      const r = await run();
      // installed=true → done; installed=false → conflict cancelled. In both cases
      // we close; we re-read the list only on an actual install.
      if (r.installed) await loadExtList();
      closeInstall();
    } catch (e) {
      installStatus = 'error';
      installError = e instanceof Error ? e.message : String(e);
    }
  }
  function onInstallFile(bytes: Uint8Array) { void runInstall(() => installBytes(bytes, { onConflict: askConflict })); }
  function onInstallUrl(url: string) { void runInstall(() => installUrl(url, { onConflict: askConflict })); }
  function onConfirmOverwrite() {
    installStatus = 'busy';                 // restore the indicator while the overwrite retry runs
    conflictResolve?.(true); conflictResolve = null;
  }

  // "Extensions" screen (SP-6). The list is a snapshot of the Go registry; we re-read after
  // every toggle and on "Refresh" (the loader scans the folder fresh on each call).
  async function loadExtList() {
    try { extPlugins = await pluginsBridge.list(); }
    catch { extPlugins = []; }
  }
  function openExtensions() {
    extensionsOpen = true;
    extDetailId = null;
    extTab = 'installed';
    closeStoreDetail();
    void loadExtList();
    void loadStoreCatalog();
    void refreshUpdates();
  }

  // Detail: we look up PluginInfo by id (manifest.id for a normal one, dir for a broken one) in
  // the fresh list snapshot. If the plugin disappeared (was deleted) — detailInfo becomes undefined.
  const detailInfo = $derived<PluginInfo | undefined>(
    extDetailId === null ? undefined : extPlugins.find((p) => (p.manifest?.id ?? p.dir) === extDetailId)
  );
  function openDetail(id: string) { extDetailId = id; void loadStorage(id); }
  function closeDetail() { extDetailId = null; detailStorage = null; }
  // Storage doesn't change on enable/disable — we re-read only on openDetail.
  async function loadStorage(id: string) {
    detailStorage = null;
    try { detailStorage = await pluginsBridge.storageInfo(id); }
    catch { detailStorage = null; }
  }
  // If the plugin open in the detail view disappeared from the list (was deleted) — return to the list.
  $effect(() => {
    if (extDetailId !== null && extPlugins.length && !extPlugins.some((p) => (p.manifest?.id ?? p.dir) === extDetailId)) {
      closeDetail();
    }
  });
  function runtimeErrorFor(id: string): string | null {
    return pluginHost.active.find((p) => p.id === id)?.error ?? null;
  }
  async function doEnable(info: PluginInfo) {
    if (!info.manifest) return;
    busyId = info.manifest.id;
    try { await enablePlugin(info.manifest); }
    finally { await loadExtList(); busyId = null; }
  }
  async function doDisable(info: PluginInfo) {
    const id = info.manifest?.id ?? info.dir;
    busyId = id;
    try { await disablePlugin(id); }
    finally { await loadExtList(); busyId = null; }
  }
  // Toggle: ON with permissions → consent; ON without permissions → immediately; OFF → no dialog.
  function onExtToggle(info: PluginInfo, on: boolean) {
    if (on) {
      if (needsConsent(info.manifest)) pendingConsent = info;
      else void doEnable(info);
    } else {
      void doDisable(info);
    }
  }

  // Deleting a plugin from the "Extensions" screen: confirmation (storage is kept) →
  // deactivate if active → Go uninstall by folder name → re-read the list.
  function onExtUninstall(info: PluginInfo) {
    const id = info.manifest?.id ?? null;
    const name = info.manifest?.name ?? info.dir;
    pendingConfirm = {
      message: t('dialog.deleteExt', { name }),
      confirmLabel: t('dialog.delete'),
      onConfirm: () => { pendingConfirm = null; void doUninstall(id, info.dir); },
    };
  }
  async function doUninstall(id: string | null, dir: string) {
    busyId = id ?? dir;
    try { await uninstallPlugin(id, dir); }
    finally {
      await loadExtList();
      if (id) {
        const { [id]: _gone, ...rest } = updates;
        updates = rest;
      }
      busyId = null;
    }
  }

  // Resetting an extension's settings: confirmation → clear storage → (if active)
  // recreate the worker → re-read the list and the storage summary. A broken plugin (no id)
  // can't be reset — it has no button, but we guard here too.
  function onExtReset(info: PluginInfo) {
    const id = info.manifest?.id ?? null;
    if (!id) return;
    const name = info.manifest?.name ?? info.dir;
    const manifest = info.manifest;
    pendingConfirm = {
      message: t('dialog.resetExt', { name }),
      confirmLabel: t('dialog.reset'),
      onConfirm: () => { pendingConfirm = null; void doReset(manifest, id); },
    };
  }
  async function doReset(manifest: PluginManifest | null, id: string) {
    busyId = id;
    try { await resetPluginStorage(manifest, id); }
    finally { await loadExtList(); await loadStorage(id); busyId = null; }
  }

  async function loadStoreCatalog(force = false) {
    storeLoading = true;
    if (force) storeError = '';
    try {
      storeCatalog = await pluginsBridge.storeCatalog(force);
      storeError = '';
    } catch (e) {
      storeError = e instanceof Error ? e.message : String(e);
    } finally {
      storeLoading = false;
    }
  }
  async function refreshUpdates() {
    try {
      const list = await pluginsBridge.storeCheckUpdates();
      updates = Object.fromEntries(list.map((u) => [u.id, u]));
    } catch {
      // Offline: keep whatever we knew; badges are advisory.
    }
  }
  function openStoreDetail(id: string) {
    storeDetailId = id;
    storeDetailData = null;
    storeDetailErr = '';
    storeActionError = '';
    void (async () => {
      try {
        storeDetailData = await pluginsBridge.storeDetail(id);
      } catch (e) {
        storeDetailErr = e instanceof Error ? e.message : String(e);
      }
    })();
  }
  function closeStoreDetail() {
    storeDetailId = null;
    storeDetailData = null;
    storeDetailErr = '';
    storeActionError = '';
  }
  // Fresh install from the store. Acceptance (spec §9.2): Install also enables —
  // through the SAME consent path as toggling on (dialog when permissions exist).
  async function doStoreInstall(id: string) {
    storeBusyId = id;
    storeActionError = '';
    try {
      const res = await storeInstall(id);
      await loadExtList();
      await refreshUpdates();
      const info = res.status === 'installed' ? (res.info ?? null) : null;
      if (info && !info.enabled) {
        if (needsConsent(info.manifest)) pendingConsent = info;
        else await doEnable(info);
      }
    } catch (e) {
      storeActionError = e instanceof Error ? e.message : String(e);
      pushStoreErrorToast(storeActionError);
    } finally {
      storeBusyId = null;
    }
  }
  // Update: permission growth → consent dialog first (spec §5.2), else straight in.
  function onStoreUpdate(id: string) {
    const u = updates[id];
    const entry = storeEntries.find((e) => e.id === id);
    if (!u || !entry) return;
    if (u.permsChanged) pendingStoreConsent = { entry, update: u };
    else void doStoreUpdate(id);
  }
  async function doStoreUpdate(id: string) {
    storeBusyId = id;
    storeActionError = '';
    try {
      await storeInstall(id);
      await loadExtList();
      await refreshUpdates();
    } catch (e) {
      storeActionError = e instanceof Error ? e.message : String(e);
      pushStoreErrorToast(storeActionError);
    } finally {
      storeBusyId = null;
    }
  }
  // A visible error toast for a failed store install/update (spec §7); the
  // inline storeActionError above already covers the open detail/consent
  // dialog, but a failure while the dialog is closed (e.g. an Installed-tab
  // update) would otherwise be silent.
  function pushStoreErrorToast(message: string): void {
    const id = pushActionToast({
      title: t('ext.store.actionFailedTitle'),
      body: message,
      tone: 'error',
      actions: [{ label: t('plugin.toastDismiss'), onAct: () => dismissToast(id) }],
    });
  }
  function onStoreUninstall(id: string) {
    const info = extPlugins.find((p) => p.manifest?.id === id);
    if (info) onExtUninstall(info); // existing confirm → doUninstall path
  }
  // A silent auto-update happened in Go: refresh our snapshots and restart the
  // worker so it runs the new code (Go replaced the folder under a live worker).
  // This runs off a background event (no user action to attach an await to), so
  // a failure here must not become an unhandled rejection — log and move on,
  // no toast spam for the background path (spec §7).
  async function onAutoUpdated(id: string) {
    try {
      const { [id]: _gone, ...rest } = updates;
      updates = rest;
      await loadExtList();
      if (pluginHost.active.some((p) => p.id === id)) {
        const info = extPlugins.find((p) => p.manifest?.id === id);
        await deactivate(id);
        if (info?.manifest && info.enabled) await activate(info.manifest);
      }
    } catch (e) {
      console.error('[store] auto-update reload failed', e);
    }
  }

  // Map a resolved §8 hotkey to actions/selectors (design §12.4). "Active" targets
  // come from the current state: active space, its active tab, its active pane.
  function applyHotkey(a: HotkeyAction) {
    const s = store.app;
    const space = s.spaces.find((sp) => sp.id === s.activeSpaceId);
    if (!space) return;
    const curTab = space.tabs.find((x) => x.id === space.activeTabId);
    const activePaneId = curTab?.activePaneId ?? '';
    switch (a.type) {
      case 'newTab':
        actions.addTab(space.id);
        break;
      case 'closePane': {
        const leaf = tab ? findLeaf(tab.root, activePaneId) : null;
        if (leaf && leaf.kind === 'editor' && leaf.activeFileId) {
          closeEditorTab(activePaneId, leaf.activeFileId);   // confirm if dirty
        } else {
          requestClose(t('dialog.closeTerminal'), [activePaneId], () => actions.closePane(activePaneId));
        }
        break;
      }
      case 'split':
        actions.splitPane(activePaneId, a.dir);
        break;
      case 'selectTabIndex':
        if (a.index < space.tabs.length) actions.setActiveTab(space.id, space.tabs[a.index].id);
        break;
      case 'focusNeighbor':
        actions.focusNeighbor(a.dir);
        break;
      case 'zoom':
        handleZoom(activePaneId);
        break;
      case 'newSpace':
        actions.addSpace();
        break;
      case 'switchSpace':
        actions.switchSpaceBy(a.delta);
        break;
      case 'toggleCollapsed':
        actions.toggleCollapsed(space.id);
        break;
      case 'toggleSidebar':
        actions.toggleSidebar();
        break;
      case 'toggleBottomPanel':
        actions.toggleBottomPanel();
        break;
      case 'toggleRightArea':
        actions.toggleRightArea();
        break;
      case 'restartPane':
        paneRestart.restart(activePaneId);
        break;
      case 'openFile':
        void openFile();
        break;
      case 'save':
        void saveActiveEditor();
        break;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (pendingConfirm || settingsOpen || extensionsOpen || pendingConsent || pendingStoreConsent || installOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        // Close the topmost layer: confirm (z115, above everything — the final confirmation)
        // → install (z105, above "Extensions", doesn't coexist with consent; during busy
        // we don't close) → consent (z110) → store consent → store card → screen (z100) → settings.
        if (pendingConfirm) pendingConfirm = null;
        else if (installOpen) { if (installStatus !== 'busy') closeInstall(); }
        else if (pendingConsent) pendingConsent = null;
        else if (pendingStoreConsent) pendingStoreConsent = null;
        else if (storeDetailId) closeStoreDetail();
        else if (extDetailId) closeDetail();
        else if (extensionsOpen) extensionsOpen = false;
        else settingsOpen = false;
      }
      return;
    }
    const action = resolveHotkey(e);
    if (!action) return;
    // preventDefault on every recognized chord — notably ⌘R (would reload the
    // webview) and ⌘N/⌘T/⌘W (OS/browser defaults). Design §12.4.
    e.preventDefault();
    applyHotkey(action);
  }

  onMount(async () => {
    await initStore();
    initLocale(store.app.ui?.locale);
    await restoreDrafts(store.app);   // B4c: drafts are restored BEFORE mounting the editor bodies
    ready = true;
    window.addEventListener('beforeunload', flushSave);
    // WKWebView fires pagehide more reliably than beforeunload on app quit —
    // flush the layout autosave there too (drafts flush via draftFlushRegistry,
    // which registers its own pagehide/beforeunload listeners).
    window.addEventListener('pagehide', flushSave);
    // Alerts are caught in the core (pty:bell) — this works for background tabs too, whose
    // panes are unmounted. We don't accumulate for the active visible pane.
    Events.On('pty:bell', (e: { data: { id: string; count: number } }) => {
      const activeId = activeTab(store.app)?.activePaneId ?? null;
      recordBell(e.data.id, e.data.count, activeId);
      // T2 toast: shown only for background alert panes (not the active one).
      if (e.data.count <= 0 || e.data.id === activeId) return;
      if (bellToasts.has(e.data.id)) return; // anti-duplicate: a toast is already shown
      const b = buildBellToast(store.app, e.data.id);
      if (!b) return; // pane not found in the tree
      const paneId = e.data.id;
      const close = (id: number) => { bellToasts.delete(paneId); dismissToast(id); };
      const id = pushActionToast({
        title: b.title,
        body: b.body,
        persistent: true,
        actions: [
          {
            label: t('toast.openPane'),
            primary: true,
            onAct: () => {
              // Re-check the location at click time — the pane may have moved.
              const loc = locatePane(store.app, paneId);
              if (loc) focusPaneAcross(loc);
              close(id);
            },
          },
          { label: t('toast.later'), onAct: () => close(id) },
        ],
      });
      bellToasts.set(paneId, id);
    });
    // Drag from Finder → open the file in a pane (B4a, fork 5).
    // In Wails v3 alpha.97 the native drop into WKWebView is NOT dispatched to JS via
    // Events.On('common:WindowFilesDropped'). The Go-side OnWindowEvent intercepts
    // it and does an explicit Emit('editor:files-dropped', payload).
    // Payload: { files: string[], x: number, y: number }
    //   files  — paths from event.Context().DroppedFiles()
    //   x, y   — from event.Context().DropTargetDetails().X/Y (0 if nil)
    // Pattern source: examples/drag-n-drop/main.go (alpha.97)
    Events.On('editor:drag-enter', () => { finderDragOver = true; });
    Events.On('editor:drag-leave', () => { finderDragOver = false; });
    Events.On('editor:files-dropped', (ev) => {
      finderDragOver = false; // the drop ends the drag session
      const e = ev as unknown as { data: { files: string[]; x: number; y: number } };
      const paths = e?.data?.files ?? [];
      const path = paths[0];
      if (!path) return;
      const x = e.data.x;
      const y = e.data.y;
      if (x || y) {
        const el = document.elementFromPoint(x, y)?.closest('[data-pane-id]') as HTMLElement | null;
        const paneId = el?.dataset.paneId;
        if (paneId && tab) {
          const leaf = findLeaf(tab.root, paneId);
          if (leaf && leaf.kind === 'editor') { actions.openFileInPane(paneId, path); return; }
          actions.openFileInNewSplit(paneId, path, 'v'); return;
        }
      }
      openPathSomewhere(path); // no coordinates or pane → §5.5 rule
    });
    // Extension store events (spec §5.1). Payloads: store:updates {updates:[UpdateInfo]},
    // store:updated {id,version}, store:consent-needed UpdateInfo. Subscribe BEFORE
    // starting the Go loop so the startup cycle's events are never lost.
    Events.On('store:updates', (ev) => {
      const e = ev as unknown as { data: { updates: UpdateInfo[] | null } };
      updates = Object.fromEntries((e.data?.updates ?? []).map((u) => [u.id, u]));
    });
    Events.On('store:updated', (ev) => {
      const e = ev as unknown as { data: { id: string; version: string } };
      if (e.data?.id) void onAutoUpdated(e.data.id);
    });
    Events.On('store:consent-needed', (ev) => {
      const e = ev as unknown as { data: UpdateInfo };
      if (e.data?.id) updates = { ...updates, [e.data.id]: e.data };
    });
    void pluginsBridge.storeStartAutoUpdate();
    void pluginsBridge
      .storeAutoUpdate()
      .then((v) => (autoUpdateExt = v))
      .catch(() => {});
    // Activate the enabled plugins in their Web Workers (spec §4). We don't block
    // ready — the list loads asynchronously, plugins appear as they activate.
    void initPluginHost();
    window.addEventListener('beforeunload', terminatePlugins);
  });

  // ts.state.onChange (§4.3): on a layout change we broadcast a fresh snapshot
  // to the subscribed plugins. The debounce coalesces bursts (drag-resize, series
  // of reducer calls). Reading stateSnapshot(store.app) establishes a reactive
  // dependency on the whole spaces/tabs/panes tree.
  let stateChangeTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const snap = stateSnapshot(store.app);
    clearTimeout(stateChangeTimer);
    stateChangeTimer = setTimeout(() => broadcastStateChanged(snap), 50);
    return () => clearTimeout(stateChangeTimer); // HMR/teardown: don't let the old timer send a snapshot
  });
</script>

<svelte:window onkeydown={onKeydown} />

{#if ready}
  <div
    class="layout"
    style:grid-template-columns={
      `${ACTIVITY_BAR_WIDTH}px ${ui.sidebarCollapsed ? '0 0' : `${ui.sidebarWidth}px 6px`} 1fr ${ui.rightAreaOpen ? `6px ${ui.rightAreaWidth ?? RIGHT_AREA_DEFAULT}px` : '0 0'}`
    }
    style:grid-template-rows={`minmax(0, 1fr) ${STATUS_BAR_HEIGHT}px`}
    style:--accent={resolveColor(ui.activeColor, ACTIVE_DEFAULT_HEX)}
    style:--exit={resolveColor(ui.exitColor, EXIT_DEFAULT_HEX)}
    style:--alert={resolveColor(ui.alertColor, ALERT_DEFAULT_HEX)}
    style:--ui-font={fontStack(ui.uiFont)}
    style:--ui-font-size={ui.uiFontSize ?? FONT_SIZE_DEFAULT}
    style:--editor-font-size={`${ui.editorFontSize ?? FONT_SIZE_DEFAULT}px`}
  >
    <ActivityBar
      collapsed={ui.sidebarCollapsed}
      onToggleSidebar={() => actions.toggleSidebar()}
      onOpenSettings={() => (settingsOpen = true)}
      onOpenExtensions={openExtensions}
      pluginButtons={abButtons}
      onPluginButton={openPluginPanel}
    />
    <aside class="sidebar">
      <NavigatorTree
        {rows}
        alertCount={rowAlertCount}
        onSelectSpace={actions.setActiveSpace}
        onSelectTab={actions.setActiveTab}
        onToggle={actions.toggleCollapsed}
        onAddSpace={() => actions.addSpace()}
        onAddTab={(spaceId) => actions.addTab(spaceId)}
        onClose={(row: NavRow) => {
          if (row.kind === 'tab' && row.tabId) {
            const space = store.app.spaces.find((s) => s.id === row.spaceId);
            const tab = space?.tabs.find((t) => t.id === row.tabId);
            if (!space || !tab) return;
            // Closing the only tab of a space removes the whole space (one-tab-space rule).
            const message = space.tabs.length <= 1
              ? t('dialog.closeSpace', { name: space.name })
              : t('dialog.closeTab', { title: tab.title });
            requestCloseRoots(message, [tab.root], leafIds(tab.root), () =>
              actions.closeTab(row.spaceId, row.tabId!));
          } else {
            const space = store.app.spaces.find((s) => s.id === row.spaceId);
            if (!space) return;
            const ids = space.tabs.flatMap((t) => leafIds(t.root));
            const roots = space.tabs.map((t) => t.root);
            requestCloseRoots(t('dialog.closeSpaceAlt', { name: space.name }), roots, ids, () =>
              actions.removeSpace(row.spaceId));
          }
        }}
        onRename={(row: NavRow, label: string) =>
          row.kind === 'tab' && row.tabId
            ? actions.renameTab(row.spaceId, row.tabId, label)
            : actions.renameSpace(row.spaceId, label)}
        onMoveTab={(tabId, toSpaceId, beforeTabId) => {
          const space = store.app.spaces.find((s) => s.id === toSpaceId);
          if (!space) return;
          const arr = space.tabs.filter((t) => t.id !== tabId).map((t) => t.id);
          const toIndex = beforeTabId === null ? arr.length : arr.indexOf(beforeTabId);
          if (toIndex < 0) return; // beforeTabId not found (e.g. self-drop) → no-op
          actions.moveTab(tabId, toSpaceId, toIndex);
        }}
        onReorderSpace={(spaceId, beforeSpaceId) => {
          const others = store.app.spaces.filter((s) => s.id !== spaceId).map((s) => s.id);
          const toIndex = beforeSpaceId === null ? others.length : others.indexOf(beforeSpaceId);
          if (toIndex < 0) return;
          actions.reorderSpace(spaceId, toIndex);
        }}
        onMoveLeaf={(dragId, target) => actions.moveLeafToNav(dragId, target)}
        rowStatus={rowStatus}
      />
    </aside>
    <SidebarResizer
      offset={ACTIVITY_BAR_WIDTH}
      onResize={(px) => actions.setSidebarWidth(px)}
      onReset={() => actions.setSidebarWidth(SIDEBAR_DEFAULT)}
    />
    <main class="main">
      <Breadcrumb
        {parts}
        onAddTab={() => actions.addTab(store.app.activeSpaceId)}
        onAddConsoles={(cols, rows) => actions.gridConsoles(cols, rows)}
        pluginItems={bcItems}
        onPluginCommand={pluginCommand}
        rightAreaOpen={ui.rightAreaOpen}
        onToggleRightArea={() => actions.toggleRightArea()}
      />
      <div class="center" data-file-drop-target>
        {#if tab}
          {#key tabKey}
            <SplitContainer
              node={tab.root}
              activePaneId={tab.activePaneId}
              zoomedPaneId={tab.zoomedPaneId}
              onFocus={actions.focusPane}
              onSplit={(paneId, dir) => actions.splitPane(paneId, dir)}
              onClose={(paneId) => closePaneById(paneId)}
              onZoom={handleZoom}
              onResize={actions.setRatio}
              onRename={actions.setPaneTitle}
              onModeChange={actions.setEditorMode}
              onMovePane={actions.movePane}
              onSplitAs={(paneId, dir) => actions.splitAsEditor(paneId, dir)}
              onSplitOpenFile={(paneId, dir) => openFileSplitFrom(paneId, dir)}
              onOpenFileHere={(paneId) => openFileForPane(paneId)}
              onActivateFile={(paneId, fileId) => actions.setActiveEditorFile(paneId, fileId)}
              onCloseFile={(paneId, fileId) => closeEditorTab(paneId, fileId)}
              onMakeTerminal={(paneId) => actions.convertPaneToTerminal(paneId)}
              onOpenPath={(path, line, col) => openPathSomewhere(path, line, col)}
              onOpenExtensions={openExtensions}
              termFontSize={ui.termFontSize ?? FONT_SIZE_DEFAULT}
            />
          {/key}
          <PerimeterDrop onMovePane={actions.movePane} />
        {/if}
        <FinderDropOverlay show={finderDragOver} />
      </div>
      {#if ui.bottomPanelOpen}
        <BottomPanel
          height={ui.bottomPanelHeight}
          onResize={(px) => actions.setBottomPanelHeight(px)}
          onReset={() => actions.setBottomPanelHeight(BOTTOM_PANEL_DEFAULT)}
          panels={bottomPanels}
          activeId={pluginPanels.activeBottom}
          onSelectTab={(id) => setActivePanel('bottom', id)}
          onCommand={pluginCommand}
        />
      {/if}
    </main>
    {#if ui.rightAreaOpen}
      <RightAreaResizer
        onResize={(px) => actions.setRightAreaWidth(px)}
        onReset={() => actions.setRightAreaWidth(RIGHT_AREA_DEFAULT)}
      />
      <aside class="right-area">
        <PluginAccordion
          panels={openRightPanels}
          collapsed={rightAccordion.collapsed}
          onToggle={(id) => toggleRightCollapsed(id)}
          onClose={(id) => { closeRightPanel(id); if (rightAccordion.open.length === 0) actions.toggleRightArea(); }}
          onCommand={pluginCommand}
        />
      </aside>
    {/if}
    <div class="statusbar-cell">
      <StatusBar
        {activePath}
        {consoleCount}
        bottomPanelOpen={ui.bottomPanelOpen}
        onToggleBottomPanel={() => actions.toggleBottomPanel()}
        pluginLeft={sbItems.left}
        pluginRight={sbItems.right}
        onPluginCommand={(pid, c) => pluginCommand(pid, c)}
      />
    </div>
  </div>
    {#if pendingConfirm}
      <ConfirmDialog
        message={pendingConfirm.message}
        confirmLabel={pendingConfirm.confirmLabel}
        onConfirm={pendingConfirm.onConfirm}
        onCancel={() => (pendingConfirm = null)}
      />
    {/if}
    {#if settingsOpen}
      <SettingsDialog
        activeColor={resolveColor(ui.activeColor, ACTIVE_DEFAULT_HEX)}
        exitColor={resolveColor(ui.exitColor, EXIT_DEFAULT_HEX)}
        alertColor={resolveColor(ui.alertColor, ALERT_DEFAULT_HEX)}
        uiFont={ui.uiFont ?? FONT_DEFAULT}
        uiFontSize={ui.uiFontSize ?? FONT_SIZE_DEFAULT}
        onActiveColor={(v) => actions.setActiveColor(v)}
        onExitColor={(v) => actions.setExitColor(v)}
        onAlertColor={(v) => actions.setAlertColor(v)}
        onFont={(k) => actions.setUiFont(k)}
        onSize={(n) => actions.setUiFontSize(n)}
        termFontSize={ui.termFontSize ?? FONT_SIZE_DEFAULT}
        editorFontSize={ui.editorFontSize ?? FONT_SIZE_DEFAULT}
        onTermSize={(n) => actions.setTermFontSize(n)}
        onEditorSize={(n) => actions.setEditorFontSize(n)}
        onReset={() => actions.resetAppearance()}
        onClose={() => (settingsOpen = false)}
        onOpenExtensions={() => { settingsOpen = false; openExtensions(); }}
        locale={ui.locale ?? 'en'}
        onLocale={(l) => { actions.setLocalePref(l); setLocale(l as Locale); }}
        storeAutoUpdate={autoUpdateExt}
        onStoreAutoUpdate={(on) => {
          autoUpdateExt = on;
          void pluginsBridge.storeSetAutoUpdate(on);
        }}
      />
    {/if}
    {#if extensionsOpen}
      {#if storeDetailId && storeDetailEntry}
        {@const sEntry = storeDetailEntry}
        <StoreCard
          entry={sEntry}
          detail={storeDetailData}
          detailError={storeDetailErr}
          installedVersion={installedVersionFor(sEntry.id)}
          update={updates[sEntry.id]}
          busy={storeBusyId === sEntry.id}
          error={storeActionError}
          onInstall={() => void doStoreInstall(sEntry.id)}
          onUpdate={() => onStoreUpdate(sEntry.id)}
          onUninstall={() => onStoreUninstall(sEntry.id)}
          onBack={closeStoreDetail}
        />
      {:else if extDetailId && detailInfo}
        {@const detail = detailInfo}
        <PluginDetail
          info={detail}
          storage={detailStorage}
          runtimeError={runtimeErrorFor(extDetailId)}
          busy={busyId === extDetailId}
          onToggle={(on) => onExtToggle(detail, on)}
          onUninstall={() => onExtUninstall(detail)}
          onReset={() => onExtReset(detail)}
          onBack={closeDetail}
        />
      {:else}
        <ExtensionsScreen
          plugins={extPlugins}
          {runtimeErrorFor}
          {busyId}
          onToggle={onExtToggle}
          onRefresh={loadExtList}
          onClose={() => { extensionsOpen = false; pendingConsent = null; closeDetail(); }}
          onInstall={openInstall}
          onUninstall={onExtUninstall}
          onOpenDetail={openDetail}
          bind:tab={extTab}
          storeEntries={storeEntries}
          storeStale={storeCatalog?.stale ?? false}
          storeLoading={storeLoading}
          storeError={storeError}
          {updates}
          {storeBusyId}
          onStoreOpen={openStoreDetail}
          onStoreInstall={(id) => void doStoreInstall(id)}
          onStoreUpdate={onStoreUpdate}
          onStoreRefresh={() => void loadStoreCatalog(true)}
        />
      {/if}
    {/if}
    {#if pendingConsent}
      <PermissionConsentDialog
        pluginName={pendingConsent.manifest?.name ?? ''}
        pluginId={pendingConsent.manifest?.id ?? ''}
        version={pendingConsent.manifest?.version ?? ''}
        permissions={consentPerms}
        onConfirm={() => { const info = pendingConsent!; pendingConsent = null; void doEnable(info); }}
        onCancel={() => (pendingConsent = null)}
      />
    {/if}
    {#if pendingStoreConsent}
      <PermissionConsentDialog
        pluginName={pendingStoreConsent.entry.name}
        pluginId={pendingStoreConsent.entry.id}
        version={pendingStoreConsent.update.to}
        permissions={storeConsentPerms}
        onConfirm={() => {
          const id = pendingStoreConsent!.update.id;
          pendingStoreConsent = null;
          void doStoreUpdate(id);
        }}
        onCancel={() => (pendingStoreConsent = null)}
      />
    {/if}
    {#if installOpen}
      <InstallDialog
        status={installStatus}
        errorMsg={installError}
        conflict={installConflict}
        onFileBytes={onInstallFile}
        onUrl={onInstallUrl}
        {onConfirmOverwrite}
        onClose={closeInstall}
      />
    {/if}
    <PluginToast />
{/if}

<style>
  :global(html, body) { margin: 0; padding: 0; height: 100%; background: var(--bg); }
  :global(#app) { height: 100vh; }
  /* Activity Bar = grid column 1 (ACTIVITY_BAR_WIDTH at x=0); the sidebar is column 2.
     SidebarResizer computes the width as clientX − offset (offset = the bar's width). If you change
     the left geometry — keep ACTIVITY_BAR_WIDTH and the resizer's offset in sync. */
  .layout { display: grid; height: 100vh; overflow: hidden; }
  /* Status bar — the bottom row spanning the full width UNDER the Activity Bar (VSCode). A wrapper,
     because App's scoped style doesn't reach the root of the child StatusBar component. */
  .statusbar-cell { grid-column: 1 / -1; grid-row: 2; min-width: 0; overflow: hidden; }
  .sidebar { overflow: hidden; border-right: 1px solid var(--border); }
  .main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .center { flex: 1; min-height: 0; background: var(--bg); position: relative; }
  .right-area { overflow: hidden; border-left: 1px solid var(--border); display: flex; flex-direction: column; min-width: 0; background: var(--bg-elevated); }
</style>
