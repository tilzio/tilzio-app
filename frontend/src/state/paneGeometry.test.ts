import { describe, it, expect } from 'vitest';
import { newLeaf, newSplit, newEditorLeaf } from './types';
import { leafRects, neighbor } from './paneGeometry';

describe('leafRects', () => {
  it('gives a single leaf the whole unit square', () => {
    const leaf = newLeaf();
    expect(leafRects(leaf).get(leaf.id)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('splits width for a vertical (side-by-side) split', () => {
    const a = newLeaf();
    const b = newLeaf();
    const rects = leafRects(newSplit('v', [a, b])); // even [.5,.5]
    expect(rects.get(a.id)).toEqual({ x: 0, y: 0, w: 0.5, h: 1 });
    expect(rects.get(b.id)).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 });
  });

  it('splits height for a horizontal (stacked) split', () => {
    const a = newLeaf();
    const b = newLeaf();
    const rects = leafRects(newSplit('h', [a, b]));
    expect(rects.get(a.id)).toEqual({ x: 0, y: 0, w: 1, h: 0.5 });
    expect(rects.get(b.id)).toEqual({ x: 0, y: 0.5, w: 1, h: 0.5 });
  });

  it('honors uneven ratios', () => {
    const a = newLeaf();
    const b = newLeaf();
    const rects = leafRects(newSplit('v', [a, b], [0.7, 0.3]));
    expect(rects.get(a.id)!.w).toBeCloseTo(0.7);
    expect(rects.get(b.id)!.x).toBeCloseTo(0.7);
    expect(rects.get(b.id)!.w).toBeCloseTo(0.3);
  });
});

describe('leafRects with editor leaves', () => {
  it('assigns a rect to an editor leaf in a mixed split', () => {
    const e = newEditorLeaf('/x.md');
    const rects = leafRects(newSplit('v', [newLeaf('/a'), e]));
    expect(rects.has(e.id)).toBe(true);
    const r = rects.get(e.id)!;
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
  });
});

describe('neighbor', () => {
  // 2x2 grid: outer vertical split of two stacked (horizontal) columns.
  //   left column: a (top), b (bottom);  right column: c (top), d (bottom)
  function grid() {
    const a = newLeaf();
    const b = newLeaf();
    const c = newLeaf();
    const d = newLeaf();
    const tree = newSplit('v', [newSplit('h', [a, b]), newSplit('h', [c, d])]);
    return { tree, a, b, c, d };
  }

  it('moves right/left across columns', () => {
    const { tree, a, c } = grid();
    const rects = leafRects(tree);
    expect(neighbor(rects, a.id, 'right')).toBe(c.id);
    expect(neighbor(rects, c.id, 'left')).toBe(a.id);
  });

  it('moves down/up within a column', () => {
    const { tree, a, b } = grid();
    const rects = leafRects(tree);
    expect(neighbor(rects, a.id, 'down')).toBe(b.id);
    expect(neighbor(rects, b.id, 'up')).toBe(a.id);
  });

  it('returns null at an edge', () => {
    const { tree, a } = grid();
    const rects = leafRects(tree);
    expect(neighbor(rects, a.id, 'left')).toBeNull();
    expect(neighbor(rects, a.id, 'up')).toBeNull();
  });

  it('returns null when the active pane is unknown', () => {
    expect(neighbor(leafRects(newLeaf()), 'ghost', 'right')).toBeNull();
  });

  it('picks the nearest in a row of three, not just any in the direction', () => {
    const a = newLeaf();
    const b = newLeaf();
    const c = newLeaf();
    const rects = leafRects(newSplit('v', [a, b, c]));
    expect(neighbor(rects, a.id, 'right')).toBe(b.id); // nearest, not c
    expect(neighbor(rects, c.id, 'left')).toBe(b.id);
  });
});
