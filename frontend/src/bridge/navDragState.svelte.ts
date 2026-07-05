// Runtime state of a drag in the navigator (mirroring bridge/dragState.svelte.ts,
// design §4/§6). NOT serialized. `dragging` is what we are dragging (null at rest); `candidate` is
// the hovered row + position for highlighting the drop indicator. Identity goes through this
// holder, NOT through dataTransfer. Isolated from pane DnD (dragState) — each system
// ignores the other's drag by checking its own holder.
export type NavDragId =
  | { kind: 'space'; spaceId: string }
  | { kind: 'tab'; spaceId: string; tabId: string };

export type NavCandidate = {
  rowKey: string;                    // row under the cursor (for highlighting)
  pos: 'before' | 'after' | 'into';  // before/after — line above/below; into — frame (into the space)
};

export const navDrag = $state<{ dragging: NavDragId | null; candidate: NavCandidate | null }>({
  dragging: null,
  candidate: null,
});

export function beginNavDrag(d: NavDragId): void {
  navDrag.dragging = d;
  navDrag.candidate = null;
}

export function setNavCandidate(c: NavCandidate | null): void {
  navDrag.candidate = c;
}

export function endNavDrag(): void {
  navDrag.dragging = null;
  navDrag.candidate = null;
}
