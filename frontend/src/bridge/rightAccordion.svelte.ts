// Runtime UI state for the right-area accordion (spec §8): which right panels are
// open (ordered) and which are collapsed. Not persisted — mirrors pluginPanels.svelte.ts.
export const rightAccordion = $state<{ open: string[]; collapsed: Record<string, boolean> }>({ open: [], collapsed: {} });

export function openRightPanel(id: string): void {
  if (!rightAccordion.open.includes(id)) rightAccordion.open.push(id);
  rightAccordion.collapsed[id] = false;
}
export function closeRightPanel(id: string): void {
  rightAccordion.open = rightAccordion.open.filter((x) => x !== id);
  delete rightAccordion.collapsed[id];
}
export function toggleRightCollapsed(id: string): void {
  rightAccordion.collapsed[id] = !rightAccordion.collapsed[id];
}
export function isRightCollapsed(id: string): boolean {
  return rightAccordion.collapsed[id] === true;
}
export function __resetForTests(): void {
  rightAccordion.open = [];
  rightAccordion.collapsed = {};
}
