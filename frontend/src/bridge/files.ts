import {
  ReadFile, WriteFile, StatFile,
  SaveDraft, LoadDraft, ClearDraft, ListDrafts,
} from '../../bindings/github.com/tilzio/tilzio/filesapp';
import { Dialogs } from '@wailsio/runtime';

// Structural types for the Go↔TS boundary (field names = json tags of filesapp.go). Declared
// locally so the wrapper does not depend on the shape of the generated models.
export interface FileStat { exists: boolean; isDir: boolean }
export interface DraftResult { found: boolean; path: string; content: string }
export interface DraftMeta { paneId: string; path: string }

// Single typed wrapper over the generated FilesApp bindings (mirror of coreBridge).
// Editor file I/O + per-pane draft store (design §5.6). Rejections (oversized /
// binary / missing) propagate from Go; callers decide how to surface them.
export const files = {
  readFile: (path: string): Promise<string> => ReadFile(path) as unknown as Promise<string>,
  writeFile: (path: string, content: string): Promise<void> =>
    WriteFile(path, content) as unknown as Promise<void>,
  statFile: (path: string): Promise<FileStat> => StatFile(path) as unknown as Promise<FileStat>,
  saveDraft: (paneId: string, path: string, content: string): Promise<void> =>
    SaveDraft(paneId, path, content) as unknown as Promise<void>,
  loadDraft: (paneId: string): Promise<DraftResult> =>
    LoadDraft(paneId) as unknown as Promise<DraftResult>,
  clearDraft: (paneId: string): Promise<void> => ClearDraft(paneId) as unknown as Promise<void>,
  listDrafts: (): Promise<DraftMeta[]> => ListDrafts() as unknown as Promise<DraftMeta[]>,

  // Native system open dialog (Wails built-in channel — we don't touch Go).
  // Returns an absolute path or null on cancel (empty string from Wails).
  openFileDialog: async (): Promise<string | null> => {
    const picked = await Dialogs.OpenFile({ Title: 'Open File' });
    return typeof picked === 'string' && picked !== '' ? picked : null;
  },
};
