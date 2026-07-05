import type { AppState } from '../state/types';
import { allEditorFiles } from '../state/selectors';
import { files } from './files';
import { editorBuffers } from './editorBuffers.svelte';
import { editorDirty } from './editorDirty.svelte';

// App startup (after initStore, before ready): pull unsaved drafts from the
// Go draft store by fileId and mark tabs "dirty"; orphaned drafts
// (a fileId not present in any EditorLeaf.files) are deleted. serialize.ts is untouched:
// path/mode come from layout.json, content comes from the draft store. (B4c, de-risk §4.)
export async function restoreDrafts(state: AppState): Promise<void> {
  const byId = new Map(allEditorFiles(state).map((f) => [f.fileId, f]));
  let metas;
  try {
    metas = await files.listDrafts();
  } catch {
    return; // no draft store / read error — start without restoration
  }
  for (const m of metas) {
    const fileId = m.paneId; // draft-store key = fileId (the field is called paneId in DraftMeta)
    const file = byId.get(fileId);
    if (!file) {
      void files.clearDraft(fileId); // orphan
      continue;
    }
    let d;
    try {
      d = await files.loadDraft(fileId);
    } catch {
      continue;
    }
    if (!d.found) continue;
    editorBuffers.set(fileId, {
      path: d.path || file.path,
      doc: d.content,
      dirty: true,
      cursor: 0,
      mode: file.mode ?? 'source',
    });
    editorDirty.set(fileId, true);
  }
}
