import { describe, it, expect, beforeEach } from 'vitest';
import { dragState, beginDrag, setCandidate, endDrag } from './dragState.svelte';

beforeEach(() => endDrag());

describe('dragState', () => {
  it('beginDrag sets dragId and clears the candidate', () => {
    setCandidate({ kind: 'swap', leafId: 'x' });
    beginDrag('p1');
    expect(dragState.dragId).toBe('p1');
    expect(dragState.candidate).toBeNull();
  });

  it('setCandidate stores the highlight target', () => {
    beginDrag('p1');
    setCandidate({ kind: 'edge', leafId: 'p2', side: 'left' });
    expect(dragState.candidate).toEqual({ kind: 'edge', leafId: 'p2', side: 'left' });
  });

  it('endDrag resets everything', () => {
    beginDrag('p1');
    setCandidate({ kind: 'swap', leafId: 'p2' });
    endDrag();
    expect(dragState.dragId).toBeNull();
    expect(dragState.candidate).toBeNull();
  });
});
