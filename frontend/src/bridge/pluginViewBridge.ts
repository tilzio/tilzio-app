import { hostEvent, type HostEvent } from './pluginProtocol';

// Dumb relay of UI messages between the plugin's Worker and its iframe tiles (spec §4.4,
// multi-instance). Addressed by paneId (multiple tiles of the same view are allowed).
// Inbound identification — ONLY by event.source (the sandboxed iframe's origin is opaque).
interface Reg { pluginId: string; win: Window }

const byPane = new Map<string, Reg>();                 // paneId -> Reg
const pending = new Map<string, unknown[]>();          // paneId -> queue before register
let workerPoster: ((pluginId: string, event: HostEvent) => void) | null = null;
let listening = false;
const PENDING_CAP = 64;                                // messages per tile; beyond that — drop oldest

function handleMessage(e: MessageEvent): void {
  const d = e.data as { __tsview?: number; data?: unknown } | null;
  if (!d || d.__tsview !== 1) return;
  let fromPane: string | undefined; let reg: Reg | undefined;
  for (const [pane, r] of byPane) if (r.win === e.source) { fromPane = pane; reg = r; break; }
  if (fromPane === undefined || !reg || !workerPoster) return;
  workerPoster(reg.pluginId, hostEvent('view-message', { paneId: fromPane, payload: d.data }));
}

function ensureListening(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('message', handleMessage);
}

export const pluginViewBridge = {
  setWorkerPoster(fn: (pluginId: string, event: HostEvent) => void): void {
    workerPoster = fn;
    ensureListening();
  },
  register(paneId: string, pluginId: string, win: Window): void {
    ensureListening();
    byPane.set(paneId, { pluginId, win });
    const q = pending.get(paneId);
    if (q) { pending.delete(paneId); for (const m of q) win.postMessage({ __tsview: 1, data: m }, '*'); }
  },
  // win given → remove the registration ONLY if this exact window is stored (otherwise a
  // remount already re-registered paneId to a new iframe — don't touch someone else's registration).
  unregister(paneId: string, win?: Window): void {
    if (win !== undefined && byPane.get(paneId)?.win !== win) return;
    byPane.delete(paneId);
    pending.delete(paneId);          // pane gone → discard its undelivered buffer
  },
  unregisterPlugin(pluginId: string): void {
    for (const [pane, r] of [...byPane]) if (r.pluginId === pluginId) { byPane.delete(pane); pending.delete(pane); }
  },
  postToPane(paneId: string, payload: unknown): void {
    const r = byPane.get(paneId);
    if (r) { r.win.postMessage({ __tsview: 1, data: payload }, '*'); return; }
    const q = pending.get(paneId) ?? [];
    q.push(payload);
    while (q.length > PENDING_CAP) q.shift();
    pending.set(paneId, q);
  },
  __handleMessageForTests(e: MessageEvent): void { handleMessage(e); },
  __resetForTests(): void {
    byPane.clear(); pending.clear(); workerPoster = null;
    if (listening && typeof window !== 'undefined') { window.removeEventListener('message', handleMessage); listening = false; }
  },
};
