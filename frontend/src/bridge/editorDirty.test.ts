import { describe, it, expect, beforeEach } from 'vitest';
import { editorDirty, __resetForTests } from './editorDirty.svelte';

beforeEach(() => __resetForTests());

describe('editorDirty', () => {
  it('defaults to false for an unknown fileId', () => {
    expect(editorDirty.get('nope')).toBe(false);
  });

  it('set then get reflects the flag', () => {
    editorDirty.set('f1', true);
    expect(editorDirty.get('f1')).toBe(true);
    editorDirty.set('f1', false);
    expect(editorDirty.get('f1')).toBe(false);
  });

  it('delete removes the flag (back to false)', () => {
    editorDirty.set('f1', true);
    editorDirty.delete('f1');
    expect(editorDirty.get('f1')).toBe(false);
  });

  it('__resetForTests clears all flags', () => {
    editorDirty.set('a', true);
    editorDirty.set('b', true);
    __resetForTests();
    expect(editorDirty.get('a')).toBe(false);
    expect(editorDirty.get('b')).toBe(false);
  });
});
