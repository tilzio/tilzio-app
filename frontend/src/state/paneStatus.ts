/**
 * Pure selectors for pane status.
 * No *.svelte.ts / rune imports — deterministic without DOM.
 * Consumed by S2 (navigator), S3 (header), S4 (status bar).
 */
import { collectLeaves } from './selectors';
import type { Tab, Space } from './types';

// Minimal NavRow needed by navStatus (kind + active); we don't import the whole NavRow
// to avoid circular dependencies selectors ↔ paneStatus.
interface NavRowCtx { kind: 'space' | 'tab'; active: boolean; }

/**
 * Superset of pane statuses (SSOT).
 * The navigator uses all 5;
 * paneStatus() emits 4 (without 'running') — running is distinguished only by navStatus() via isLive.
 */
export type PaneStatus = 'active' | 'running' | 'alert' | 'exited' | 'idle';

/**
 * Pane status priority: active > alert > exited > idle.
 * 'running' is not emitted — only navStatus() via the isLive context.
 */
export function paneStatus(
  _paneId: string,
  opts: { isActive: boolean; alertCount: number; exited: boolean },
): PaneStatus {
  if (opts.isActive) return 'active';
  if (opts.alertCount > 0) return 'alert';
  if (opts.exited) return 'exited';
  return 'idle';
}

/**
 * Mapping of pane status to the dot color CSS variable.
 * We respect the user's alert/accent/exit color — do NOT hardcode hex, use var().
 * var(--idle) is declared in theme.css S0.1 (#5a5450).
 */
export function paneStatusDotColor(s: PaneStatus): string {
  switch (s) {
    case 'active':
      return 'var(--accent)';
    case 'running':
      return 'var(--green)';
    case 'alert':
      return 'var(--alert)';
    case 'exited':
      return 'var(--exit)';
    case 'idle':
      return 'var(--idle)';
    default:
      // guard against future type extensions
      return 'var(--idle)';
  }
}

/**
 * Numeric rank of a status to pick the worst (highest-priority) from a set.
 * Priority: active=3 > alert=2 > exited=1 > idle=0.
 * 'running' is not emitted by aggregators — folds in as idle.
 */
function rankStatus(s: PaneStatus): number {
  switch (s) {
    case 'active': return 3;
    case 'alert':  return 2;
    case 'exited': return 1;
    default:       return 0; // idle, running
  }
}

/** Returns the higher-priority status of the two. */
function worst(a: PaneStatus, b: PaneStatus): PaneStatus {
  return rankStatus(a) >= rankStatus(b) ? a : b;
}

/**
 * Aggregated tab status: walks all leaves via collectLeaves,
 * computes paneStatus for each and folds to the highest priority.
 * Order: active > alert > exited > idle.
 */
export function tabStatus(
  tab: Tab,
  ctx: {
    activePaneId: string | null;
    alertCounts: Record<string, number>;
    isExited: (id: string) => boolean;
  },
): PaneStatus {
  const leaves = collectLeaves(tab.root);
  return leaves.reduce<PaneStatus>((acc, l) => {
    const s = paneStatus(l.id, {
      isActive: l.id === ctx.activePaneId,
      alertCount: ctx.alertCounts[l.id] ?? 0,
      exited: ctx.isExited(l.id),
    });
    return worst(acc, s);
  }, 'idle');
}

/**
 * Aggregated space status: folds tabStatus over all tabs.
 * Priority order identical to tabStatus / paneStatus.
 */
export function spaceStatus(
  space: Space,
  ctx: {
    activePaneId: string | null;
    alertCounts: Record<string, number>;
    isExited: (id: string) => boolean;
  },
): PaneStatus {
  return space.tabs.reduce<PaneStatus>((acc, t) => {
    return worst(acc, tabStatus(t, ctx));
  }, 'idle');
}

/**
 * Navigator row status (all 5 PaneStatus values, including 'running').
 * Pure: status is passed via the ctx argument (selectors.ts does not import stores).
 * Priority: active > alert > exited > running > idle.
 * §9: does not touch PTY / liveSet / spawn.
 */
export function navStatus(
  row: NavRowCtx,
  ctx: {
    alertCount: number;
    leafIds: string[];
    exited: Record<string, number>;
    isLive: (id: string) => boolean;
  },
): PaneStatus {
  // active beats everything else
  if (row.active) return 'active';
  // at least one alert on any leaf of the row
  if (ctx.alertCount > 0) return 'alert';
  // at least one leaf has exited (key in exited)
  if (ctx.leafIds.some((id) => id in ctx.exited)) return 'exited';
  // at least one leaf is alive (process running)
  if (ctx.leafIds.some((id) => ctx.isLive(id))) return 'running';
  return 'idle';
}
