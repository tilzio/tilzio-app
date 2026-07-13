// Runtime tracking of which panes the user has typed into ("touched"). Used to
// decide whether closing a terminal needs confirmation (don't lose active work).
// Not serialized; resets on app restart. Mirrors the runtime-registry pattern of
// ptyEvents/paneRestart.
const touched = new Set<string>();

export const touchedPanes = {
  mark(paneId: string): void {
    touched.add(paneId);
  },
  // Forget a pane that left the layout (paneReaper) — pane ids are never reused.
  unmark(paneId: string): void {
    touched.delete(paneId);
  },
  isTouched(paneId: string): boolean {
    return touched.has(paneId);
  },
};

// Test seam: clear module state between unit tests.
export function __resetForTests(): void {
  touched.clear();
}
