import { hostEvent, type HostEvent } from './pluginProtocol';

// Dumb relay of UI messages between the plugin's Worker and its iframe frames.
// Addressed by an opaque frameId: tiles use their paneId; docked panels use
// "panel:<location>:<pluginId>:<panelId>". Inbound identification — ONLY by
// event.source (the sandboxed iframe's origin is opaque).
interface Reg { pluginId: string; win: Window }

const byFrame = new Map<string, Reg>();                // frameId -> Reg
const pending = new Map<string, unknown[]>();          // frameId -> queue before register
let workerPoster: ((pluginId: string, event: HostEvent) => void) | null = null;
let listening = false;
const PENDING_CAP = 64;                                // messages per frame; beyond that — drop oldest

function handleMessage(e: MessageEvent): void {
  const d = e.data as { __tsview?: number; data?: unknown } | null;
  if (!d || d.__tsview !== 1) return;
  let fromFrame: string | undefined; let reg: Reg | undefined;
  for (const [frame, r] of byFrame) if (r.win === e.source) { fromFrame = frame; reg = r; break; }
  if (fromFrame === undefined || !reg || !workerPoster) return;
  workerPoster(reg.pluginId, hostEvent('view-message', { frameId: fromFrame, payload: d.data }));
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
  register(frameId: string, pluginId: string, win: Window): void {
    ensureListening();
    byFrame.set(frameId, { pluginId, win });
    const q = pending.get(frameId);
    if (q) { pending.delete(frameId); for (const m of q) win.postMessage({ __tsview: 1, data: m }, '*'); }
  },
  // win given → remove the registration ONLY if this exact window is stored (otherwise a
  // remount already re-registered frameId to a new iframe — don't touch someone else's registration).
  unregister(frameId: string, win?: Window): void {
    if (win !== undefined && byFrame.get(frameId)?.win !== win) return;
    byFrame.delete(frameId);
    pending.delete(frameId);
  },
  unregisterPlugin(pluginId: string): void {
    for (const [frame, r] of [...byFrame]) if (r.pluginId === pluginId) { byFrame.delete(frame); pending.delete(frame); }
  },
  postToFrame(frameId: string, payload: unknown): void {
    const r = byFrame.get(frameId);
    if (r) { r.win.postMessage({ __tsview: 1, data: payload }, '*'); return; }
    const q = pending.get(frameId) ?? [];
    q.push(payload);
    while (q.length > PENDING_CAP) q.shift();
    pending.set(frameId, q);
  },
  __handleMessageForTests(e: MessageEvent): void { handleMessage(e); },
  __resetForTests(): void {
    byFrame.clear(); pending.clear(); workerPoster = null;
    if (listening && typeof window !== 'undefined') { window.removeEventListener('message', handleMessage); listening = false; }
  },
};
