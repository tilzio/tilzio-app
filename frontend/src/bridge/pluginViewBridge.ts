import { hostEvent, type HostEvent } from './pluginProtocol';

// Relay of UI messages between the plugin's Worker and its iframe frames.
// Addressed by an opaque frameId: tiles use their paneId; docked panels use
// "panel:<location>:<pluginId>:<panelId>". Inbound identification — ONLY by
// event.source (the sandboxed iframe's origin is opaque). Outbound plugin posts
// are OWNERSHIP-gated: register() records which plugin owns a frame, and
// postToFrame drops posts whose owner doesn't match (see deliver()).
interface Reg { pluginId: string; win: Window }
// owner: pluginId of the SENDER for plugin-originated posts (ownership-gated), or
// null for host-originated posts (theme etc. — unrestricted, see postToFrameFromHost).
interface PendingMsg { owner: string | null; data: unknown }

const byFrame = new Map<string, Reg>();                // frameId -> Reg
const pending = new Map<string, PendingMsg[]>();       // frameId -> queue before register
let workerPoster: ((pluginId: string, event: HostEvent) => void) | null = null;
let listening = false;
const PENDING_CAP = 64;                                // messages per frame; beyond that — drop oldest

// Single delivery path: a plugin (owner=pluginId) may only reach frames REGISTERED to it —
// a mismatch is silently dropped (plugin A must not post into plugin B's iframe). The host
// (owner=null) bypasses the check. Before register the message is queued WITH its owner;
// the ownership decision is deferred to register-time flush.
function deliver(frameId: string, payload: unknown, owner: string | null): void {
  const r = byFrame.get(frameId);
  if (r) {
    if (owner !== null && r.pluginId !== owner) return;   // foreign frame — silently drop
    r.win.postMessage({ __tsview: 1, data: payload }, '*');
    return;
  }
  const q = pending.get(frameId) ?? [];
  q.push({ owner, data: payload });
  while (q.length > PENDING_CAP) q.shift();
  pending.set(frameId, q);
}

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
    if (q) {
      pending.delete(frameId);
      // Ownership holds for the queued path too: messages queued by a plugin other than the
      // one the frame registers under are dropped; host messages (owner=null) always flush.
      for (const m of q) if (m.owner === null || m.owner === pluginId) win.postMessage({ __tsview: 1, data: m.data }, '*');
    }
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
  // Plugin-originated post (ts.view.post): expectedOwner = the CALLING plugin's id
  // (ctx.pluginId from pluginApi, never attacker-controlled args). Wrong owner → drop.
  postToFrame(frameId: string, payload: unknown, expectedOwner: string): void {
    deliver(frameId, payload, expectedOwner);
  },
  // Host-originated post (theme etc.) — internal path, not reachable from plugin RPC; unrestricted.
  postToFrameFromHost(frameId: string, payload: unknown): void {
    deliver(frameId, payload, null);
  },
  __handleMessageForTests(e: MessageEvent): void { handleMessage(e); },
  __resetForTests(): void {
    byFrame.clear(); pending.clear(); workerPoster = null;
    if (listening && typeof window !== 'undefined') { window.removeEventListener('message', handleMessage); listening = false; }
  },
};
