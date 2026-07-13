import { describe, it, expect, vi, beforeEach } from 'vitest';

// The store schedules autosaves and (with this fix) reaps killed panes through
// coreBridge — mock the whole bridge so no Wails runtime is needed.
vi.mock('../bridge/core', () => ({
  coreBridge: {
    kill: vi.fn().mockResolvedValue(undefined),
    saveLayout: vi.fn().mockResolvedValue(undefined),
    loadLayout: vi.fn().mockResolvedValue(null),
  },
}));

import { coreBridge } from '../bridge/core';
import { store, actions } from './store.svelte';
import { collectLeaves } from './selectors';
import { reapedPanes, __resetForTests as resetReaped } from '../bridge/reapedPanes';

function termIds(): string[] {
  return store.app.spaces
    .flatMap((sp) => sp.tabs.flatMap((t) => collectLeaves(t.root)))
    .filter((l) => l.kind === 'terminal')
    .map((l) => l.id);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetReaped();
});

describe('store commit reaps removed terminal panes', () => {
  it('closePane kills the removed pane session and tombstones it', () => {
    const keep = termIds()[0];
    actions.splitPane(keep, 'v');
    const added = termIds().find((id) => id !== keep && !reapedPanes.has(id))!;
    actions.closePane(added);
    expect(coreBridge.kill).toHaveBeenCalledWith(added);
    expect(reapedPanes.has(added)).toBe(true);
  });

  it('moving a tab to another space kills nothing', () => {
    actions.addSpace('reap-move-target');
    const src = store.app.spaces[0];
    const dst = store.app.spaces[store.app.spaces.length - 1];
    actions.moveTab(src.tabs[0].id, dst.id, 0);
    expect(coreBridge.kill).not.toHaveBeenCalled();
  });

  it('closing a tab kills every terminal in it', () => {
    // Build an isolated space with one extra tab holding a split (2 terminals).
    actions.addSpace('reap-close-tab');
    const space = store.app.spaces[store.app.spaces.length - 1];
    actions.addTab(space.id, 'victim');
    const victim = store.app.spaces.find((s) => s.id === space.id)!.tabs[1];
    actions.splitPane(victim.root.id, 'v');
    const victimIds = collectLeaves(
      store.app.spaces.find((s) => s.id === space.id)!.tabs[1].root,
    ).map((l) => l.id);
    expect(victimIds).toHaveLength(2);
    vi.mocked(coreBridge.kill).mockClear();
    actions.closeTab(space.id, victim.id);
    for (const id of victimIds) expect(coreBridge.kill).toHaveBeenCalledWith(id);
  });
});
