// Status-bar counters: running (live terminals) and alert (panes awaiting attention).
// Pure functions — no store/rune imports; they walk the layout via collectLeaves.
import { collectLeaves } from './selectors';
import type { AppState } from './types';

// Number of terminal leaves across the whole layout for which !isExited(id).
// Editor/plugin leaves are not included in the running count.
export function runningCount(s: AppState, isExited: (id: string) => boolean): number {
  const leaves = s.spaces
    .flatMap((sp) => sp.tabs)
    .flatMap((t) => collectLeaves(t.root));
  return leaves.filter((l) => l.kind === 'terminal' && !isExited(l.id)).length;
}

// Number of layout leaves for which (counts[id] ?? 0) > 0.
// Counts panes (not the sum of bells); orphaned counts are ignored.
export function alertCount(s: AppState, counts: Record<string, number>): number {
  const leaves = s.spaces
    .flatMap((sp) => sp.tabs)
    .flatMap((t) => collectLeaves(t.root));
  return leaves.filter((l) => (counts[l.id] ?? 0) > 0).length;
}
