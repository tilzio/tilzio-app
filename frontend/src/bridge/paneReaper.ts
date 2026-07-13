import { coreBridge } from './core';
import { reapedPanes } from './reapedPanes';
import { clearAlerts } from './alerts.svelte';
import { clearExited } from './exitedPanes.svelte';
import { touchedPanes } from './touchedPanes';

// Runtime teardown for terminal panes permanently removed from the layout
// (closed pane/tab/space). Layout reducers are pure — this is their imperative
// counterpart: kill the Go PTY session and drop the pane's runtime-registry
// entries. Unmount alone must NOT do this (§9: remount replays + reattaches),
// which is why it hangs off the store's commit diff, not component lifecycle.
export function reapPanes(ids: readonly string[]): void {
  for (const id of ids) {
    reapedPanes.mark(id);
    // Swallow kill errors: the session may already be gone (the shell exited
    // before the close) — the pane is out of the layout either way.
    try {
      void coreBridge.kill(id).catch(() => {});
    } catch {
      // Binding unavailable (teardown) — nothing left to kill.
    }
    clearAlerts(id);
    clearExited(id);
    touchedPanes.unmark(id);
  }
}
