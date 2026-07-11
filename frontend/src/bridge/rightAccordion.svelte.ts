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
// Reactive stale-id guard: drop any open id no longer backed by a live plugin panel
// (e.g. the plugin was disabled/removed while its right panel was open). Idempotent —
// safe to call every time validIds changes, including with an already-pruned set. The
// re-run-until-stable guard matters here: this runs from a $effect that also reads
// `open`/`collapsed`, so a no-op call must skip the writes entirely (not just leave the
// *content* unchanged) — reassigning `open` to a new-but-equal array would still flip its
// reference and re-dirty the effect, causing it to loop forever instead of converging.
export function pruneRightPanels(validIds: string[]): void {
  const valid = new Set(validIds);
  const nextOpen = rightAccordion.open.filter((id) => valid.has(id));
  if (nextOpen.length !== rightAccordion.open.length) rightAccordion.open = nextOpen;
  for (const id of Object.keys(rightAccordion.collapsed)) {
    if (!valid.has(id)) delete rightAccordion.collapsed[id];
  }
}
export function __resetForTests(): void {
  rightAccordion.open = [];
  rightAccordion.collapsed = {};
}
