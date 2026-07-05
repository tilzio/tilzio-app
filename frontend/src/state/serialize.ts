import { type AppState, initialState } from './types';

export function serialize(s: AppState): string {
  return JSON.stringify(s);
}

// Recursive validator for the pane tree (splits and leaves of any kind).
// Splits must have a non-empty children array (each child also valid).
// Leaves only require a string kind + string id — unknown kinds are accepted
// for forward-compat (render dispatcher handles unknown kinds gracefully).
function isValidNode(n: unknown): boolean {
  if (!n || typeof n !== 'object') return false;
  const node = n as Record<string, unknown>;
  if (node.kind === 'split') {
    return Array.isArray(node.children) && node.children.length >= 1 && node.children.every(isValidNode);
  }
  // leaf of any type: string kind + string id
  return typeof node.kind === 'string' && typeof node.id === 'string';
}

// Structural guard: enough to reject corrupt/empty shapes before they reach the
// UI. The core already backs up unparseable layout.json (spec §7); this guards
// against parseable-but-wrong shapes.
function isAppState(o: unknown): o is AppState {
  if (!o || typeof o !== 'object') return false;
  const a = o as Record<string, unknown>;
  if (typeof a.activeSpaceId !== 'string' || !Array.isArray(a.spaces) || a.spaces.length < 1) {
    return false; // invariant: always >= 1 space
  }
  return a.spaces.every((sp) => {
    const s = sp as Record<string, unknown>;
    if (!s || typeof s.id !== 'string' || !Array.isArray(s.tabs) || s.tabs.length < 1) return false;
    return s.tabs.every((t) => {
      const tab = t as Record<string, unknown>;
      return tab && isValidNode(tab.root);
    });
  });
}

export function deserialize(json: string): AppState {
  const obj = JSON.parse(json) as unknown;
  if (!isAppState(obj)) throw new Error('invalid layout shape');
  return obj;
}

export function loadOrDefault(json: string | null): AppState {
  if (!json) return initialState();
  try {
    return deserialize(json);
  } catch {
    return initialState();
  }
}
