import type { AppState } from './types';
import { locatePane, paneLabel } from './selectors';
import { t } from '../i18n/index.svelte';

// Build the title/body/location of a T2 toast from a bell event. null → the pane is closed.
// Pure function: doesn't depend on reactive stores, unit-tested.
export function buildBellToast(
  app: AppState,
  paneId: string,
): { title: string; body: string; loc: { spaceId: string; tabId: string; paneId: string } } | null {
  const loc = locatePane(app, paneId);
  if (!loc) return null;
  const label = paneLabel(app, paneId) ?? t('toast.paneFallback');
  const space = app.spaces.find((sp) => sp.id === loc.spaceId);
  const spaceName = space?.name ?? t('toast.spaceFallback');
  return {
    title: t('toast.bellWaiting', { label }),
    body: t('toast.bellBody', { spaceName, label }),
    loc,
  };
}

// Which paneIds in the anti-dup bellToasts map point to a toast that no longer exists
// among the live ones (the toast was dismissed by any path: ✕/Later/programmatically). A pure function for
// reactive cleanup of the map in App — catches all dismiss paths, not just the close() closure.
export function staleBellPanes(
  bell: Iterable<[string, number]>,
  liveToastIds: Set<number>,
): string[] {
  const stale: string[] = [];
  for (const [paneId, toastId] of bell) {
    if (!liveToastIds.has(toastId)) stale.push(paneId);
  }
  return stale;
}
