import { describe, it, expect } from 'vitest';
import { shouldConfirmClose, dirtyEditorFiles, unsavedCloseMessage } from './closeConfirm';
import { newEditorFile } from './types';

const none = (_id: string) => false;

describe('shouldConfirmClose', () => {
  it('no confirm for a single untouched terminal', () => {
    expect(shouldConfirmClose(['a'], none)).toBe(false);
  });
  it('confirms when more than one terminal', () => {
    expect(shouldConfirmClose(['a', 'b'], none)).toBe(true);
  });
  it('confirms when a single terminal is touched', () => {
    expect(shouldConfirmClose(['a'], (id) => id === 'a')).toBe(true);
  });
  it('confirms when any of several is touched', () => {
    expect(shouldConfirmClose(['a', 'b'], (id) => id === 'b')).toBe(true);
  });
  it('no confirm for empty ids', () => {
    expect(shouldConfirmClose([], none)).toBe(false);
  });
});

describe('editor unsaved-close helpers', () => {
  it('dirtyEditorFiles keeps only files whose fileId is dirty', () => {
    const a = newEditorFile('/a.ts');
    const b = newEditorFile('/b.ts');
    const dirty = new Set([a.fileId]);
    const out = dirtyEditorFiles([a, b], (id) => dirty.has(id));
    expect(out).toEqual([a]);
  });

  it('unsavedCloseMessage names a single file', () => {
    expect(unsavedCloseMessage(['notes.md'])).toBe(
      '«notes.md» has unsaved changes. Close without saving?',
    );
  });

  it('unsavedCloseMessage aggregates multiple files by count', () => {
    expect(unsavedCloseMessage(['a.ts', 'b.ts', 'c.ts'])).toBe(
      '3 files have unsaved changes. Close without saving?',
    );
  });
});
