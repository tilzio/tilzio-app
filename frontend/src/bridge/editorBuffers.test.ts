import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  editorBuffers,
  draftFlushRegistry,
  markSaveFailed,
  __resetForTests,
  type EditorBuffer,
} from './editorBuffers.svelte';

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

// FIX: purge deletes the buffer AND tombstones the id, so a still-mounted
// EditorFileBody.onDestroy cannot resurrect it (per-closed-file memory leak).
describe('editorBuffers purge tombstone', () => {
  it('purge deletes the buffer and marks the id purged', () => {
    editorBuffers.set('f1', buf());
    editorBuffers.purge('f1');
    expect(editorBuffers.has('f1')).toBe(false);
    expect(editorBuffers.consumePurged('f1')).toBe(true);
  });

  it('consumePurged clears the tombstone (returns true exactly once)', () => {
    editorBuffers.purge('f1');
    expect(editorBuffers.consumePurged('f1')).toBe(true);
    expect(editorBuffers.consumePurged('f1')).toBe(false);
  });

  it('consumePurged is false for never-purged ids', () => {
    expect(editorBuffers.consumePurged('nope')).toBe(false);
  });

  it('__resetForTests clears tombstones too', () => {
    editorBuffers.purge('f1');
    __resetForTests();
    expect(editorBuffers.consumePurged('f1')).toBe(false);
  });
});

// FIX: on a failed ⌘S the catch must restore dirty on the CURRENT buffer —
// not overwrite it with the stale pre-await snapshot (typed text was rolled back).
describe('markSaveFailed', () => {
  it('sets dirty on the current buffer, keeping its (newer) text', () => {
    editorBuffers.set('f1', buf({ doc: 'before save', dirty: false }));
    // The user typed while writeFile was in flight:
    editorBuffers.set('f1', buf({ doc: 'typed during await', dirty: true, cursor: 7 }));
    markSaveFailed('f1');
    expect(editorBuffers.get('f1')).toEqual(buf({ doc: 'typed during await', dirty: true, cursor: 7 }));
  });

  it('flips dirty back on without touching doc/cursor', () => {
    editorBuffers.set('f1', buf({ doc: 'kept', dirty: false, cursor: 3 }));
    markSaveFailed('f1');
    expect(editorBuffers.get('f1')).toEqual(buf({ doc: 'kept', dirty: true, cursor: 3 }));
  });

  it('is a no-op when the buffer is gone (closed during the await)', () => {
    markSaveFailed('gone');
    expect(editorBuffers.has('gone')).toBe(false);
  });
});

// FIX: drafts are debounced 400ms; app quit lost the tail. Components register
// their pending-flush here; window pagehide/beforeunload flush them all.
describe('draftFlushRegistry', () => {
  it('flushAll invokes every registered flush', () => {
    const a = vi.fn();
    const b = vi.fn();
    draftFlushRegistry.register(a);
    draftFlushRegistry.register(b);
    draftFlushRegistry.flushAll();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    draftFlushRegistry.unregister(a);
    draftFlushRegistry.unregister(b);
  });

  it('unregister removes a flush (dead components are not called)', () => {
    const a = vi.fn();
    draftFlushRegistry.register(a);
    draftFlushRegistry.unregister(a);
    draftFlushRegistry.flushAll();
    expect(a).not.toHaveBeenCalled();
  });
});
