// Runtime state of link resolution (Stage C): per-pane live-cwd (OSC 7 / initial
// cwd), one derived home, and a path-existence cache over files.statFile.
// Plain module (not $state): the link-provider reads on demand from xterm, reactivity is not needed.
// Mirror of editorBuffers.svelte.ts.
import { files } from './files';
import { deriveHome } from './pathLinks';

const cwdByPane = new Map<string, string>();

export const linkCwd = {
  get(paneId: string): string | undefined {
    return cwdByPane.get(paneId);
  },
  set(paneId: string, cwd: string): void {
    if (cwd) cwdByPane.set(paneId, cwd); // an empty cwd would give a false resolve of `/rel`
  },
  delete(paneId: string): void {
    cwdByPane.delete(paneId);
  },
};

let home: string | null = null;

export const linkHome = {
  // Derives home from the first suitable absolute path; does not overwrite an already-found one.
  setFrom(abs: string): void {
    if (home) return;
    home = deriveHome(abs);
  },
  get(): string | null {
    return home;
  },
};

// path → whether it exists as a file (not a directory). We cache the Promise (not a bool): two
// concurrent calls for the same path (the link-provider validates candidates via
// Promise.all) share a single statFile call. Entries expire after a TTL (~30s) so files
// created/deleted mid-session eventually flip, and the map is capped (~500) with simple
// insertion-order eviction so a long session cannot grow it unboundedly.
const EXISTS_TTL_MS = 30_000;
const EXISTS_MAX_ENTRIES = 500;
const existsCache = new Map<string, { p: Promise<boolean>; at: number }>();

export function checkPathExists(path: string): Promise<boolean> {
  const now = Date.now();
  const hit = existsCache.get(path);
  if (hit && now - hit.at < EXISTS_TTL_MS) return hit.p;
  const p = files
    .statFile(path)
    .then((st) => st.exists && !st.isDir)
    .catch(() => false);
  existsCache.delete(path); // re-insert so a refreshed entry moves to the back of the eviction order
  existsCache.set(path, { p, at: now });
  if (existsCache.size > EXISTS_MAX_ENTRIES) {
    const oldest = existsCache.keys().next().value;
    if (oldest !== undefined) existsCache.delete(oldest);
  }
  return p;
}

export function __resetForTests(): void {
  cwdByPane.clear();
  existsCache.clear();
  home = null;
}
