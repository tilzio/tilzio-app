// Tombstones of terminal panes permanently removed from the layout (killed by
// paneReaper). Consulted by TerminalPane's spawn-race check (a pane closed
// while its spawn was in flight must re-kill the fresh session) and by
// ptyEvents.routeExited (the trailing pty:exited of a killed session must not
// resurrect an exitedPanes entry). Grows only on pane close — a handful of
// UUID strings per session, and pane ids are never reused (crypto.randomUUID).
const reaped = new Set<string>();

export const reapedPanes = {
  mark(paneId: string): void {
    reaped.add(paneId);
  },
  has(paneId: string): boolean {
    return reaped.has(paneId);
  },
};

// Test seam: clear module state between unit tests.
export function __resetForTests(): void {
  reaped.clear();
}
