import { describe, it, expect } from 'vitest';
import { reorderIds } from './reorder';

describe('reorderIds', () => {
  const ids = ['a', 'b', 'c', 'd'];
  it('move down, insert after target', () => expect(reorderIds(ids, 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd']));
  it('move down, insert before target', () => expect(reorderIds(ids, 'a', 'c', 'before')).toEqual(['b', 'a', 'c', 'd']));
  it('move up, insert before target', () => expect(reorderIds(ids, 'd', 'b', 'before')).toEqual(['a', 'd', 'b', 'c']));
  it('drag === target → unchanged', () => expect(reorderIds(ids, 'b', 'b', 'after')).toEqual(ids));
  it('unknown target → unchanged', () => expect(reorderIds(ids, 'a', 'zzz', 'after')).toEqual(ids));
  it('does not mutate input', () => { const c = ids.slice(); reorderIds(c, 'a', 'c', 'after'); expect(c).toEqual(ids); });
});
