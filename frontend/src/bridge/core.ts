import {
  Spawn, Write, Resize, Kill, SaveLayout, LoadLayout, LoadScrollback, ShellTag,
} from '../../bindings/github.com/tilzio/tilzio/app';
import { base64ToBytes } from '../base64';

// Single typed wrapper over the generated Wails bindings. Keeps components and
// the store off the raw binding module and centralizes the base64/error shims.
export const coreBridge = {
  spawn: (id: string, cwd: string, cols: number, rows: number) => Spawn(id, cwd, cols, rows),
  write: (id: string, data: string) => Write(id, data),
  resize: (id: string, cols: number, rows: number) => Resize(id, cols, rows),
  kill: (id: string) => Kill(id),
  // Short process tag for the pane (foreground name, e.g. "vitest", or the shell
  // basename as a fallback). Runtime data — NOT persisted.
  shellTag: (id: string): Promise<string> => ShellTag(id),
  saveLayout: (json: string) => SaveLayout(json),
  // LoadLayout rejects on ErrNotFound/ErrCorrupt — treat any rejection as "no
  // layout" so the store falls back to a default (spec §7).
  loadLayout: async (): Promise<string | null> => {
    try {
      return await LoadLayout();
    } catch {
      return null;
    }
  },
  // Persisted scrollback comes back base64-encoded (raw PTY bytes); decode for
  // term.write(). Used by Plan 3b's replay-on-mount.
  loadScrollback: async (id: string): Promise<Uint8Array> => base64ToBytes(await LoadScrollback(id)),
};
