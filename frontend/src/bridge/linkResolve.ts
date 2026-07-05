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
// Promise.all) share a single statFile call. Cache lasts for the session (best-effort, like OSC 7;
// deleting a file during a session is a rare edge, not critical for the MVP).
const existsCache = new Map<string, Promise<boolean>>();

export function checkPathExists(path: string): Promise<boolean> {
  let p = existsCache.get(path);
  if (p) return p;
  p = files
    .statFile(path)
    .then((st) => st.exists && !st.isDir)
    .catch(() => false);
  existsCache.set(path, p);
  return p;
}

export function __resetForTests(): void {
  cwdByPane.clear();
  existsCache.clear();
  home = null;
}
