// Reactive holder for toasts from ts.notify (spec §9). Ephemeral (mirroring
// alerts.svelte.ts); auto-dismiss on timeout.
import type { Tone } from '../state/widgets';

/** A button in the actionable toast T2 */
export interface ToastAction { label: string; onAct: () => void; primary?: boolean; }

export interface Toast {
  id: number;
  pluginId: string;
  title: string;
  body?: string;
  tone?: Tone;
  icon?: string;
  /** 'plugin' (default, T1) or 'action' (T2 core toast, persistent) */
  kind?: 'plugin' | 'action';
  actions?: ToastAction[];
  /** persistent → no auto-TTL */
  persistent?: boolean;
}

const TOAST_TTL_MS = 4000;
let seq = 0;

export const toasts = $state<{ items: Toast[] }>({ items: [] });

export function pushToast(pluginId: string, payload: string | { title?: string; body?: string; tone?: Tone; icon?: string }): void {
  const id = ++seq;
  const t: Toast = typeof payload === 'string'
    ? { id, pluginId, title: payload }
    : {
        id,
        pluginId,
        title: payload.title ?? '',
        ...(payload.body ? { body: payload.body } : {}),
        ...(payload.tone ? { tone: payload.tone } : {}),
        ...(payload.icon ? { icon: payload.icon } : {}),
      };
  toasts.items = [...toasts.items, t];
  setTimeout(() => dismissToast(id), TOAST_TTL_MS);
}

/** Core toast with buttons (T2 "waiting for input"); persistent → no auto-TTL */
export function pushActionToast(opts: {
  title: string;
  body?: string;
  actions: ToastAction[];
  tone?: Tone;
  persistent?: boolean;
}): number {
  const id = ++seq;
  const t: Toast = {
    id,
    pluginId: '',
    kind: 'action',
    title: opts.title,
    ...(opts.body ? { body: opts.body } : {}),
    ...(opts.tone ? { tone: opts.tone } : {}),
    actions: opts.actions,
    ...(opts.persistent ? { persistent: true } : {}),
  };
  toasts.items = [...toasts.items, t];
  if (opts.persistent !== true) {
    setTimeout(() => dismissToast(id), TOAST_TTL_MS);
  }
  return id;
}

export function dismissToast(id: number): void {
  toasts.items = toasts.items.filter((t) => t.id !== id);
}

export function __resetForTests(): void {
  toasts.items = [];
  seq = 0;
}
