import type { AppState } from './types';
import { activeEditorFile } from './types';
import { collectLeaves } from './selectors';

// Read-only layout snapshot for plugins (ts.state.get, spec §4.1). Builds a
// NEW object from AppState — no references to the store (the plugin does not
// mutate the structure; also the snapshot passes through postMessage →
// structured-clone). cwd = the starting Leaf.cwd (spec R1): the live cwd on `cd`
// is NOT tracked.
export interface SnapshotLeaf { id: string; cwd: string; title?: string }
export interface SnapshotTab { id: string; title: string; activePaneId: string; leaves: SnapshotLeaf[] }
export interface SnapshotSpace { id: string; name: string; activeTabId: string; tabs: SnapshotTab[] }
export interface StateSnapshot { activeSpaceId: string; spaces: SnapshotSpace[] }

export function stateSnapshot(s: AppState): StateSnapshot {
  return {
    activeSpaceId: s.activeSpaceId,
    spaces: s.spaces.map((sp) => ({
      id: sp.id,
      name: sp.name,
      activeTabId: sp.activeTabId,
      tabs: sp.tabs.map((t) => ({
        id: t.id,
        title: t.title,
        activePaneId: t.activePaneId,
        leaves: collectLeaves(t.root).map((l) =>
          l.kind === 'terminal'
            ? { id: l.id, cwd: l.cwd, title: l.title }
            : l.kind === 'editor'
              ? { id: l.id, cwd: '', title: activeEditorFile(l)?.path }
              : { id: l.id, cwd: '', title: l.viewId }),
      })),
    })),
  };
}
