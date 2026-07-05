import type { EditorFile } from './types';
import { t } from '../i18n/index.svelte';

// Pure rule for confirming a destructive close: confirm if it would remove more
// than one terminal, or any terminal the user has typed into ("touched").
export function shouldConfirmClose(ids: string[], isTouched: (id: string) => boolean): boolean {
  return ids.length > 1 || ids.some((id) => isTouched(id));
}

// Files whose fileId is currently "dirty" (isDirty reads the reactive editorDirty in App).
export function dirtyEditorFiles(
  filesList: EditorFile[],
  isDirty: (fileId: string) => boolean,
): EditorFile[] {
  return filesList.filter((f) => isDirty(f.fileId));
}

// ConfirmDialog text when closing with unsaved edits. One file — by name;
// multiple — aggregated by count (mockup editor-b4b-confirm-close.html).
export function unsavedCloseMessage(names: string[]): string {
  if (names.length === 1) return t('dialog.unsavedCloseOne', { name: names[0] });
  return t('dialog.unsavedCloseMany', { count: names.length });
}
