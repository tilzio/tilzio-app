import type { DropTarget } from '../state/dropZone';

// Runtime state of a pane drag (design §6). NOT serialized. `dragId` is the
// pane being dragged (null at rest); `candidate` is the hovered drop zone for
// highlighting. Thin $state holder (like store.svelte.ts): all logic lives in the pure
// paneDropSide and the movePane reducer.
export const dragState = $state<{ dragId: string | null; candidate: DropTarget | null }>({
  dragId: null,
  candidate: null,
});

export function beginDrag(paneId: string): void {
  dragState.dragId = paneId;
  dragState.candidate = null;
}

export function setCandidate(c: DropTarget | null): void {
  dragState.candidate = c;
}

export function endDrag(): void {
  dragState.dragId = null;
  dragState.candidate = null;
}
