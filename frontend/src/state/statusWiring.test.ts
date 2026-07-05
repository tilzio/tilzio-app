import { describe, it, expect, afterEach } from 'vitest';
import { runningCount, alertCount } from './statusCounts';
import { spaceStatus } from './paneStatus';
import { initialState, newTab } from './types';
import { markExited, isExited, __resetForTests } from '../bridge/exitedPanes.svelte';
afterEach(__resetForTests);
describe('S1.6 status wiring (App contract)', () => {
  it('runningTotal/alertTotal/spaceStatus are consistent on a single layout', () => {
    const app = initialState();
    const sp = app.spaces[0]!;
    sp.tabs = [newTab(), newTab(), newTab()];
    sp.activeTabId = sp.tabs[0]!.id;
    const [id0, id1] = [sp.tabs[0]!.activePaneId, sp.tabs[1]!.activePaneId];
    markExited(id0, 0);                 // one terminal exited
    const counts = { [id1!]: 2 };       // another — with an alert
    expect(runningCount(app, isExited)).toBe(2);   // 3 terminals − 1 exited
    expect(alertCount(app, counts)).toBe(1);       // one pane awaiting attention
    expect(spaceStatus(sp, { activePaneId: null, alertCounts: counts, isExited })).toBe('alert');
  });
});
