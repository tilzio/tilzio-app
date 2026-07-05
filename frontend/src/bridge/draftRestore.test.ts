import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./files', () => ({
  files: {
    listDrafts: vi.fn(),
    loadDraft: vi.fn(),
    clearDraft: vi.fn(async () => undefined),
  },
}));

import { files } from './files';
import { restoreDrafts } from './draftRestore';
import { editorBuffers, __resetForTests as __resetBuffers } from './editorBuffers.svelte';
import { editorDirty, __resetForTests as __resetDirty } from './editorDirty.svelte';
import { initialState, newSplit, newLeaf, newEditorLeaf, type EditorLeaf } from '../state/types';

beforeEach(() => {
  __resetBuffers();
  __resetDirty();
  vi.clearAllMocks();
});

// State with a single editor file; return its fileId.
function stateWithEditor(): { state: ReturnType<typeof initialState>; fileId: string } {
  const state = initialState();
  const ed = newEditorLeaf('/proj/a.ts');
  state.spaces[0].tabs[0].root = newSplit('v', [newLeaf('/t'), ed]);
  const fileId = (ed as EditorLeaf).files[0].fileId;
  return { state, fileId };
}

it('restores a draft into the buffer + dirty ● for a known fileId', async () => {
  const { state, fileId } = stateWithEditor();
  (files.listDrafts as ReturnType<typeof vi.fn>).mockResolvedValue([{ paneId: fileId, path: '/proj/a.ts' }]);
  (files.loadDraft as ReturnType<typeof vi.fn>).mockResolvedValue({ found: true, path: '/proj/a.ts', content: 'DRAFT' });

  await restoreDrafts(state);

  expect(editorBuffers.get(fileId)?.doc).toBe('DRAFT');
  expect(editorBuffers.get(fileId)?.dirty).toBe(true);
  expect(editorDirty.get(fileId)).toBe(true);
  expect(files.clearDraft).not.toHaveBeenCalled();
});

it('clears an orphan draft (fileId not in any editor leaf)', async () => {
  const { state } = stateWithEditor();
  (files.listDrafts as ReturnType<typeof vi.fn>).mockResolvedValue([{ paneId: 'ghost-id', path: '/gone.ts' }]);

  await restoreDrafts(state);

  expect(files.clearDraft).toHaveBeenCalledWith('ghost-id');
  expect(files.loadDraft).not.toHaveBeenCalled();
});

it('skips a known draft that is not found (no buffer, no dirty)', async () => {
  const { state, fileId } = stateWithEditor();
  (files.listDrafts as ReturnType<typeof vi.fn>).mockResolvedValue([{ paneId: fileId, path: '/proj/a.ts' }]);
  (files.loadDraft as ReturnType<typeof vi.fn>).mockResolvedValue({ found: false, path: '', content: '' });

  await restoreDrafts(state);

  expect(editorBuffers.get(fileId)).toBeUndefined();
  expect(editorDirty.get(fileId)).toBe(false);
});
