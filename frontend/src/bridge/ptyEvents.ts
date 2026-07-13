import { Events } from '@wailsio/runtime';
import { base64ToBytes } from '../base64';
import { hostEvent, type HostEvent } from './pluginProtocol';
import { markExited } from './exitedPanes.svelte';
import { reapedPanes } from './reapedPanes';

// Single global fan-out for the two PTY event streams (design §11.4, fork B).
// One Events.On subscription each; output/exit are dispatched to the per-pane
// handler registered by the mounted TerminalPane, or ignored (the back-ring in
// Go already holds the bytes). `liveSet` is the source of truth for which panes
// have been spawned in this process, so remounting a pane replays-only instead
// of re-spawning.
type OutputHandler = (bytes: Uint8Array) => void;
type ExitedHandler = (code: number) => void;

const handlers = new Map<string, { onOutput: OutputHandler; onExited: ExitedHandler }>();
const liveSet = new Set<string>();

interface PluginSub { pluginId: string; paneId: string; subId: string; kind: 'output' | 'exit'; }
const pluginSubs = new Map<string, PluginSub>();              // key=pluginId|subId
const paneSubs = new Map<string, Set<string>>();             // paneId -> Set<key>
const pendingOut = new Map<string, Uint8Array[]>();          // key(output) -> chunks before flush
let poster: ((pluginId: string, event: HostEvent) => void) | null = null;
let flushHandle: ReturnType<typeof setTimeout> | null = null;
const PENDING_CAP = 256 * 1024;                              // bytes per subscription; beyond that — drop oldest (best-effort)

function subKey(pluginId: string, subId: string): string { return pluginId + '|' + subId; }

function scheduleFlush(): void {
  if (flushHandle !== null) return;
  flushHandle = setTimeout(flushPending, 0);
}
function flushPending(): void {
  flushHandle = null;
  if (!poster) { pendingOut.clear(); return; }              // poster removed (reload/teardown) — drop without crashing
  for (const [key, chunks] of pendingOut) {
    const sub = pluginSubs.get(key);
    if (!sub) continue;                                      // subscription removed between push and flush — skip
    let total = 0; for (const c of chunks) total += c.length;
    const merged = new Uint8Array(total);
    let off = 0; for (const c of chunks) { merged.set(c, off); off += c.length; }
    try { poster(sub.pluginId, hostEvent('terminal-output', { subId: sub.subId, bytes: merged })); } catch { /* a subscriber does not break the stream */ }
  }
  pendingOut.clear();
}

// Exported for unit tests; also the bodies the Events.On callbacks delegate to.
export function routeOutput(id: string, bytes: Uint8Array): void {
  handlers.get(id)?.onOutput(bytes);
  const keys = paneSubs.get(id);
  if (!keys) return;
  for (const key of keys) {
    const sub = pluginSubs.get(key);
    if (!sub || sub.kind !== 'output') continue;
    const buf = pendingOut.get(key) ?? [];
    buf.push(bytes);
    let total = 0; for (const c of buf) total += c.length;
    while (total > PENDING_CAP && buf.length > 1) { total -= buf.shift()!.length; }  // bounded
    pendingOut.set(key, buf);
    scheduleFlush();
  }
}
export function routeExited(id: string, code: number): void {
  // A pane closed via paneReaper emits a trailing pty:exited when Go finishes
  // the kill — recording it would resurrect the just-cleared exitedPanes entry.
  // SSOT (constraints.md §68-70): markExited stays first, before all handlers.
  if (!reapedPanes.has(id)) markExited(id, code);
  liveSet.delete(id);
  handlers.get(id)?.onExited(code);
  const keys = paneSubs.get(id);
  if (!keys) return;
  for (const key of [...keys]) {
    const sub = pluginSubs.get(key);
    if (sub && sub.kind === 'exit' && poster) {
      try { poster(sub.pluginId, hostEvent('terminal-exit', { subId: sub.subId, code })); } catch { /* no-op */ }
    }
    pluginSubs.delete(key);
    pendingOut.delete(key);
  }
  paneSubs.delete(id);   // paneId reuse on ⌘R: the previous session's subscriptions are removed
}

let started = false;
function ensureStarted(): void {
  if (started) return;
  started = true;
  Events.On('pty:output', (e: { data: { id: string; chunk: string } }) =>
    routeOutput(e.data.id, base64ToBytes(e.data.chunk)),
  );
  Events.On('pty:exited', (e: { data: { id: string; code: number } }) =>
    routeExited(e.data.id, e.data.code),
  );
}

export const ptyEvents = {
  register(paneId: string, onOutput: OutputHandler, onExited: ExitedHandler): void {
    ensureStarted();
    handlers.set(paneId, { onOutput, onExited });
  },
  unregister(paneId: string): void {
    handlers.delete(paneId);
  },
  isLive(paneId: string): boolean {
    return liveSet.has(paneId);
  },
  markLive(paneId: string): void {
    liveSet.add(paneId);
  },
  setPluginPoster(fn: (pluginId: string, event: HostEvent) => void): void { poster = fn; },
  subscribePlugin(pluginId: string, paneId: string, subId: string, kind: 'output' | 'exit'): void {
    const key = subKey(pluginId, subId);
    pluginSubs.set(key, { pluginId, paneId, subId, kind });
    const set = paneSubs.get(paneId) ?? new Set<string>();
    set.add(key); paneSubs.set(paneId, set);
  },
  unsubscribePluginSub(pluginId: string, subId: string): void {
    const key = subKey(pluginId, subId);
    const sub = pluginSubs.get(key);
    if (!sub) return;
    pluginSubs.delete(key); pendingOut.delete(key);
    paneSubs.get(sub.paneId)?.delete(key);
  },
  unsubscribePlugin(pluginId: string): void {
    for (const [key, sub] of [...pluginSubs]) {
      if (sub.pluginId !== pluginId) continue;
      pluginSubs.delete(key); pendingOut.delete(key);
      paneSubs.get(sub.paneId)?.delete(key);
    }
  },
  __flushForTests(): void { flushPending(); },
};

// Go keeps PTY sessions alive for the whole Go process. Under `wails3 dev` (and
// any webview reload) the JS `liveSet` above resets while Go still holds the
// session, so a remount's spawn() comes back with core.ErrAlreadySpawned. That
// is NOT a start failure — the session is live and its output still flows in via
// pty:output — so the pane should reattach instead of showing an error. Match on
// a stable substring of the Go sentinel ("core: session already exists for
// pane"), robust to the `core:` prefix and the Wails JSON error wrapping.
export function isAlreadySpawnedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('session already exists for pane');
}

// Test seam: clear module state between unit tests.
export function __resetForTests(): void {
  handlers.clear();
  liveSet.clear();
  started = false;
  if (flushHandle !== null) { clearTimeout(flushHandle); flushHandle = null; }
  pluginSubs.clear(); paneSubs.clear(); pendingOut.clear();
  poster = null;
}
