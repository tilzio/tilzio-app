import type { AppState, PaneId } from './types';
import { collectLeaves } from './selectors';

// All terminal-leaf ids across every space and tab of the app state.
export function terminalPaneIds(state: AppState): Set<PaneId> {
  const ids = new Set<PaneId>();
  for (const sp of state.spaces)
    for (const t of sp.tabs)
      for (const l of collectLeaves(t.root)) if (l.kind === 'terminal') ids.add(l.id);
  return ids;
}

// Terminal panes present in `before` and gone from `after` — i.e. permanently
// removed from the layout by a reducer step. Moves are not removals: a moved
// leaf keeps its id somewhere in the state, and scanning the WHOLE state (not
// just one tab) keeps them out of the result.
export function removedTerminalPanes(before: AppState, after: AppState): PaneId[] {
  const kept = terminalPaneIds(after);
  return [...terminalPaneIds(before)].filter((id) => !kept.has(id));
}
