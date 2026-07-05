// Tiny runtime registry mapping a paneId to its restart callback (design §12.3),
// mirroring ptyEvents. The mounted TerminalPane registers its restart fn; the
// global ⌘R handler in App calls restart(activePaneId). The callback no-ops when
// the pane is still live, so calling it on a healthy pane is harmless.
const restarts = new Map<string, () => void>();

export const paneRestart = {
  register(paneId: string, fn: () => void): void {
    restarts.set(paneId, fn);
  },
  unregister(paneId: string): void {
    restarts.delete(paneId);
  },
  restart(paneId: string): void {
    restarts.get(paneId)?.();
  },
};

// Test seam: clear module state between unit tests.
export function __resetForTests(): void {
  restarts.clear();
}
