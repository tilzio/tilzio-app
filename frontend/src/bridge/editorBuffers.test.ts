import { describe, it, expect, beforeEach } from 'vitest';
import { editorBuffers, __resetForTests, type EditorBuffer } from './editorBuffers.svelte';

beforeEach(() => __resetForTests());

const buf = (over: Partial<EditorBuffer> = {}): EditorBuffer => ({
  path: '/a.ts', doc: 'x', dirty: false, cursor: 0, mode: 'source', ...over,
});

describe('editorBuffers', () => {
  it('set + get round-trips a buffer', () => {
    editorBuffers.set('p1', buf({ doc: 'edited', dirty: true, cursor: 3 }));
    const got = editorBuffers.get('p1');
    expect(got).toEqual(buf({ doc: 'edited', dirty: true, cursor: 3 }));
  });

  it('has reflects presence; remount-read after a prior set (§9 analog)', () => {
    expect(editorBuffers.has('p1')).toBe(false);
    editorBuffers.set('p1', buf());
    expect(editorBuffers.has('p1')).toBe(true);
    // "unmount" does not call delete — the buffer remains for the next mount.
    expect(editorBuffers.get('p1')).toBeTruthy();
  });

  it('delete removes a buffer (pane close)', () => {
    editorBuffers.set('p1', buf());
    editorBuffers.delete('p1');
    expect(editorBuffers.has('p1')).toBe(false);
    editorBuffers.delete('p1'); // idempotent
    expect(editorBuffers.has('p1')).toBe(false);
  });

  it('get returns undefined for unknown pane', () => {
    expect(editorBuffers.get('nope')).toBeUndefined();
  });
});
