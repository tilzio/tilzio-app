import { describe, it, expect } from 'vitest';
import { stateSnapshot } from './pluginState';
import type { AppState } from './types';
import { initialState, newEditorLeaf, newLeaf, newSplit } from './types';

function fixture(): AppState {
  return {
    activeSpaceId: 'sp1',
    spaces: [
      {
        id: 'sp1', name: 'S1', collapsed: false, activeTabId: 't1',
        tabs: [
          {
            id: 't1', title: 'T1', activePaneId: 'p1', zoomedPaneId: null,
            root: {
              kind: 'split', id: 'sx', dir: 'v', ratio: [0.5, 0.5],
              children: [
                { kind: 'terminal', id: 'p1', cwd: '/a', title: 'L1' },
                { kind: 'terminal', id: 'p2', cwd: '/b' },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('stateSnapshot', () => {
  it('flattens leaves (id/cwd/title) and carries active ids', () => {
    const snap = stateSnapshot(fixture());
    expect(snap.activeSpaceId).toBe('sp1');
    expect(snap.spaces[0].activeTabId).toBe('t1');
    expect(snap.spaces[0].tabs[0].activePaneId).toBe('p1');
    expect(snap.spaces[0].tabs[0].leaves).toEqual([
      { id: 'p1', cwd: '/a', title: 'L1' },
      { id: 'p2', cwd: '/b', title: undefined },
    ]);
  });

  it('represents an editor leaf with empty cwd and path as title', () => {
    const s = initialState();
    s.spaces[0].tabs[0].root = newSplit('v', [newLeaf('/a'), newEditorLeaf('/x.md')]);
    const snap = stateSnapshot(s);
    const leaves = snap.spaces[0].tabs[0].leaves;
    const ed = leaves.find((l) => l.title === '/x.md');
    expect(ed).toBeTruthy();
    expect(ed!.cwd).toBe('');
  });

  it('returns a fresh object (no references into the store)', () => {
    const s = fixture();
    const snap = stateSnapshot(s);
    expect(snap.spaces[0]).not.toBe(s.spaces[0]);
  });
});
