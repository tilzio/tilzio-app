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
};

// Test seam: clear module state between unit tests.
export function __resetForTests(): void {
  buffers.clear();
}
