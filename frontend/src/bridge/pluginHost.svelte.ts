import { createSandbox, type Sandbox } from './pluginSandbox';
import { pluginsBridge, type PluginManifest } from './plugins';
import { isRpcRequest, rpcResult, rpcError, hostEvent } from './pluginProtocol';
import { dispatch, isKnownMethod } from './pluginApi';
import { parseContributes, type Contributions } from '../state/pluginContributions';
import type { StateSnapshot } from '../state/pluginState';
import { ptyEvents } from './ptyEvents';
import { pluginViewBridge } from './pluginViewBridge';

// An active plugin in the registry. ui — the latest ui.update per contribId; SP-4 renders
// them into slots (status bar/panels/bars).
export interface ActivePlugin {
  id: string;
  name: string;
  sandbox: Sandbox | null;
  ui: Record<string, unknown>;
  contributes: Contributions;
  permissions: string[];
  error: string | null;
}

export interface LogEntry { seq: number; pluginId: string; line: string; }

const MAX_LOG = 100;
let logSeq = 0;
const utf8 = new TextDecoder();

// Reactive state of active plugins (the source for rendering SP-4 slots).
export const pluginHost = $state<{ active: ActivePlugin[]; log: LogEntry[] }>({
  active: [],
  log: [],
});

function addLog(pluginId: string, line: string): void {
  pluginHost.log = [...pluginHost.log, { seq: ++logSeq, pluginId, line }].slice(-MAX_LOG);
}

// The log must not fail on non-serializable arguments (e.g. BigInt from postMessage):
// a throw here would hang the plugin's promise (the reply wouldn't be sent). Hence safe.
function safeJson(v: unknown, limit: number): string {
  try { return JSON.stringify(v).slice(0, limit); } catch { return '[non-serializable]'; }
}

function find(id: string): ActivePlugin | undefined {
  return pluginHost.active.find((p) => p.id === id);
}

// ui.update coalescing: every RPC used to synchronously replace the reactive ui record,
// so a flooding worker could freeze the main thread. Instead we buffer (cid → data) per
// plugin and flush ONCE per macrotask (setTimeout 0); the LAST write per cid wins and the
// Map preserves per-cid insertion order. Buffers of a plugin deactivated before the flush
// are DROPPED (deactivate/terminateAll delete them; flush also skips ids gone from the
// registry) — a terminated plugin must not write ui posthumously.
const pendingUi = new Map<string, Map<string, unknown>>();   // pluginId -> (cid -> latest data)
let uiFlushTimer: ReturnType<typeof setTimeout> | null = null;

function queueUiUpdate(pluginId: string, cid: string, data: unknown): void {
  let per = pendingUi.get(pluginId);
  if (!per) { per = new Map(); pendingUi.set(pluginId, per); }
  per.set(cid, data);
  if (uiFlushTimer === null) uiFlushTimer = setTimeout(flushUiUpdates, 0);
}

function flushUiUpdates(): void {
  uiFlushTimer = null;
  for (const [pluginId, per] of pendingUi) {
    const e = find(pluginId);
    if (!e) continue;   // deactivated while buffered — drop
    let ui = e.ui;
    for (const [cid, data] of per) ui = { ...ui, [cid]: data };
    e.ui = ui;   // ONE reactive assignment per plugin per flush
  }
  pendingUi.clear();
}

// Activation at startup (spec §4): list + activate every enabled valid plugin.
export async function init(): Promise<void> {
  ptyEvents.setPluginPoster((pluginId, event) => { const p = find(pluginId); if (p?.sandbox) p.sandbox.post(event); });
  pluginViewBridge.setWorkerPoster((pluginId, event) => { const p = find(pluginId); if (p?.sandbox) p.sandbox.post(event); });
  let list;
  try {
    list = await pluginsBridge.list();
  } catch (e) {
    addLog('host', `PluginsList failed: ${String(e)}`);
    return;
  }
  for (const info of list) {
    if (info.enabled && info.manifest && !info.err) {
      await activate(info.manifest);
    }
  }
}

// In-flight activations: the registry guard below is only filled AFTER the readFile await,
// so two overlapping activate(id) calls would both pass it and spawn a duplicate worker
// (one orphaned, never terminated). Checked+set synchronously BEFORE the first await.
const activating = new Set<string>();

// Activate ONE plugin (start its worker). Idempotent (a repeat call/HMR
// doesn't spawn duplicates). Called from init() at startup and from the "Extensions" screen (SP-6).
export async function activate(manifest: PluginManifest): Promise<void> {
  const { id, name, entry } = manifest;
  // Idempotency: a repeat init() (e.g. HMR in `wails3 dev`) doesn't spawn duplicates;
  // `activating` covers the window before the record lands in the registry.
  if (find(id) || activating.has(id)) return;
  activating.add(id);
  try {
    let code: string;
    try {
      const bytes = await pluginsBridge.readFile(id, entry);
      code = utf8.decode(bytes);
    } catch (e) {
      addLog(id, `readFile failed: ${String(e)}`);
      return;
    }
    // Put the record into the registry BEFORE creating the sandbox, so callbacks find it via
    // find(id) (the reactive proxy) rather than closing over a local reference.
    pluginHost.active = [...pluginHost.active, { id, name, sandbox: null, ui: {}, contributes: parseContributes(manifest.contributes), permissions: manifest.permissions ?? [], error: null }];
    const sandbox = createSandbox(
      code,
      (data) => routeFromWorker(id, data),
      (err) => { const e = find(id); if (e) e.error = err; addLog(id, `worker error: ${err}`); },
    );
    const record = find(id);
    if (record) record.sandbox = sandbox;
    sandbox.post(hostEvent('activate', { pluginId: id }));
    addLog(id, 'activated');
  } finally {
    activating.delete(id);
  }
}

function routeFromWorker(pluginId: string, data: unknown): void {
  if (!isRpcRequest(data)) return;
  const entry = find(pluginId);
  if (!entry || !entry.sandbox) return;
  const sb = entry.sandbox;
  if (!isKnownMethod(data.method)) {
    sb.post(rpcError(data.id, `unknown method: ${data.method}`));
    return;
  }
  addLog(pluginId, `${data.method}(${safeJson(data.args, 80)})`);
  dispatch(
    { pluginId, permissions: find(pluginId)?.permissions ?? [], setUi: (cid, d) => queueUiUpdate(pluginId, cid, d) },
    data.method,
    data.args,
  ).then(
    (result) => sb.post(rpcResult(data.id, result)),
    (err) => sb.post(rpcError(data.id, String(err?.message ?? err))),
  );
}

// Send a UI event to the plugin (click on its element/icon → command).
export function sendUiEvent(pluginId: string, payload: unknown): void {
  find(pluginId)?.sandbox?.post(hostEvent('ui-event', payload));
}

// Broadcast a layout snapshot to all active plugins (ts.state.onChange, §4.3).
// A worker without a subscription ignores the event. We don't filter by permissions (they're
// informational, trusted §2). The snapshot is built by the caller (App $effect) — pluginHost
// doesn't depend on the store.
export function broadcastStateChanged(snapshot: StateSnapshot): void {
  for (const p of pluginHost.active) {
    p.sandbox?.post(hostEvent('state-changed', snapshot));
  }
}

// Deactivate all (window close / HMR teardown — spec §17).
export function terminateAll(): void {
  for (const p of pluginHost.active) {
    ptyEvents.unsubscribePlugin(p.id);
    pluginViewBridge.unregisterPlugin(p.id);
    p.sandbox?.post(hostEvent('deactivate', { pluginId: p.id }));
    p.sandbox?.terminate();
  }
  pluginHost.active = [];
  pendingUi.clear();   // buffered ui.update of terminated plugins is dropped, not flushed
}

// Deactivate ONE plugin at runtime (the "off" toggle in the "Extensions" screen, SP-6).
// Mirror of terminateAll for a single one: deactivate event → terminate → remove from active.
// SP-4 contributions (icon/status bar/widgets) disappear on their own — they're $derived from active[].
export function deactivate(id: string): void {
  const p = find(id);
  if (!p) return;
  ptyEvents.unsubscribePlugin(id);
  pluginViewBridge.unregisterPlugin(id);
  p.sandbox?.post(hostEvent('deactivate', { pluginId: id }));
  p.sandbox?.terminate();
  pluginHost.active = pluginHost.active.filter((x) => x.id !== id);
  pendingUi.delete(id);   // buffered ui.update of the deactivated plugin is dropped, not flushed
  addLog(id, 'deactivated');
}

export function __resetForTests(): void {
  pluginHost.active = [];
  pluginHost.log = [];
  logSeq = 0;
  activating.clear();
  pendingUi.clear();
  if (uiFlushTimer !== null) { clearTimeout(uiFlushTimer); uiFlushTimer = null; }
}
