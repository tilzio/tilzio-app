// Runtime alert (BEL) counters by paneId. Increases on a bell from a NON-active
// console, resets to zero when it's focused. Ephemeral — NOT serialized (reset on
// restart), mirroring the runtime holders dragState.svelte.ts / touchedPanes.
export const alerts = $state<{ counts: Record<string, number> }>({ counts: {} });

export function bell(paneId: string, n = 1): void {
  alerts.counts[paneId] = (alerts.counts[paneId] ?? 0) + n;
}

// Record an alert from the Go pty:bell event. We ignore the active visible pane
// (the user already sees it); all others accumulate (incl. background tabs).
export function recordBell(id: string, count: number, activePaneId: string | null): void {
  if (count > 0 && id !== activePaneId) bell(id, count);
}

export function clearAlerts(paneId: string): void {
  if (alerts.counts[paneId]) delete alerts.counts[paneId];
}

// Test seam: clear module state between unit tests.
export function __resetForTests(): void {
  alerts.counts = {};
}
