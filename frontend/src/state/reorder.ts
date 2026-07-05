// Pure id reordering: move dragId to the position before/after targetId.
// Returns a NEW array (input is not mutated). drag===target or an unknown target → a copy of the input.
export function reorderIds(ids: string[], dragId: string, targetId: string, pos: 'before' | 'after'): string[] {
  if (dragId === targetId) return ids.slice();
  const without = ids.filter((x) => x !== dragId);
  const at = without.indexOf(targetId);
  if (at < 0) return ids.slice();
  without.splice(pos === 'before' ? at : at + 1, 0, dragId);
  return without;
}
