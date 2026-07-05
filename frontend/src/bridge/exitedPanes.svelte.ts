// Ephemeral registry of exited panes (exit code by paneId).
// Analog of alerts.svelte.ts — NOT serialized, reset on reload.
// The key is present ⟺ the pane has exited; code 0 is a valid exit (checked via `in`, not `if`).
export const exitedPanes = $state<{ codes: Record<string, number> }>({ codes: {} });

// Mark a pane as exited with the given code (including code 0 — successful exit).
export function markExited(paneId: string, code: number): void {
  exitedPanes.codes[paneId] = code;
}

// Clear the exited mark of a pane (on PTY restart).
export function clearExited(paneId: string): void {
  if (paneId in exitedPanes.codes) delete exitedPanes.codes[paneId];
}

// Check whether a pane is marked as exited.
export function isExited(paneId: string): boolean {
  return paneId in exitedPanes.codes;
}

// Test seam: reset state between unit tests.
export function __resetForTests(): void {
  exitedPanes.codes = {};
}
