import type { EditorMode } from '../state/types';

// Unsaved editor buffer for one pane — survives unmount/move/zoom in this process
// (design §5.4, the editor's analog of §9 mount-without-kill). `cursor` is the CM6
// selection head offset; `dirty` drives the header ●.
export interface EditorBuffer {
  path?: string;
  doc: string;
  dirty: boolean;
  cursor: number;
  mode: EditorMode;
}

// Module-level cache (mirror of ptyEvents.liveSet): EditorFileBody writes its buffer
// here on unmount and reads it back on mount; the key is a per-file `fileId` (one tab),
// NOT a paneId — the same file can be reopened in a new tab and share its buffer by fileId.
// Buffer is never deleted on unmount (§9 analog of mount-without-kill); explicit delete() is
// used only for orphan cleanup (B4c) or when the tab is permanently closed.
const buffers = new Map<string, EditorBuffer>();

// Tombstones for permanently-closed files: purge() marks the id so a still-mounted
// EditorFileBody.onDestroy (which unconditionally re-writes its buffer) cannot
// resurrect the deleted entry — that was a per-closed-file memory leak.
const purged = new Set<string>();

export const editorBuffers = {
  get(fileId: string): EditorBuffer | undefined {
    return buffers.get(fileId);
  },
  set(fileId: string, buf: EditorBuffer): void {
    buffers.set(fileId, buf);
  },
  has(fileId: string): boolean {
    return buffers.has(fileId);
  },
  delete(fileId: string): void {
    buffers.delete(fileId);
  },
  // Permanent close (App.purgeEditorFiles): delete the buffer AND tombstone the id.
  purge(fileId: string): void {
    buffers.delete(fileId);
    purged.add(fileId);
  },
  // onDestroy seam: true exactly once after purge; consuming clears the tombstone.
  consumePurged(fileId: string): boolean {
    return purged.delete(fileId);
  },
};

// On a failed ⌘S, restore `dirty` on the CURRENT buffer. The caller must NOT
// write back its pre-await snapshot: text typed while writeFile was in flight
// lives in the current buffer and would be rolled back.
export function markSaveFailed(fileId: string): void {
  const cur = buffers.get(fileId);
  if (cur) buffers.set(fileId, { ...cur, dirty: true });
}

// Drafts are debounced (~400ms) inside EditorFileBody and flushed on component
// destroy — but an app quit unmounts nothing, losing the tail. Each mounted body
// registers its pending-flush here; pagehide/beforeunload flush them all.
const pendingFlushes = new Set<() => void>();

export const draftFlushRegistry = {
  register(fn: () => void): void {
    pendingFlushes.add(fn);
  },
  unregister(fn: () => void): void {
    pendingFlushes.delete(fn);
  },
  flushAll(): void {
    pendingFlushes.forEach((fn) => fn());
  },
};

// window is absent in node-env unit tests; jsdom and the real webview have it.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => draftFlushRegistry.flushAll());
  window.addEventListener('beforeunload', () => draftFlushRegistry.flushAll());
}

// Test seam: clear module state between unit tests.
export function __resetForTests(): void {
  buffers.clear();
  purged.clear();
  pendingFlushes.clear();
}
