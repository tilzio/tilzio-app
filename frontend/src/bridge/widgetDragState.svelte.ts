// Runtime drag state of a reorder-widget item (design §1). NOT serialized.
// ISOLATED from pane-DnD (dragState) and nav-DnD (navDrag): each reads only its own holder.
export const widgetDrag = $state<{
  dragId: string | null;
  command: string | null;
  candidate: { id: string; pos: 'before' | 'after' } | null;
}>({ dragId: null, command: null, candidate: null });

export function beginWidgetDrag(id: string, command: string): void {
  widgetDrag.dragId = id;
  widgetDrag.command = command;
  widgetDrag.candidate = null;
}
export function setWidgetCandidate(c: { id: string; pos: 'before' | 'after' } | null): void {
  widgetDrag.candidate = c;
}
export function endWidgetDrag(): void {
  widgetDrag.dragId = null;
  widgetDrag.command = null;
  widgetDrag.candidate = null;
}
