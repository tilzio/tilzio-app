import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./core', () => ({
  coreBridge: { kill: vi.fn().mockResolvedValue(undefined) },
}));

import { coreBridge } from './core';
import { reapPanes } from './paneReaper';
import { reapedPanes, __resetForTests as resetReaped } from './reapedPanes';
import { alerts, bell, __resetForTests as resetAlerts } from './alerts.svelte';
import { exitedPanes, markExited, __resetForTests as resetExited } from './exitedPanes.svelte';
import { touchedPanes, __resetForTests as resetTouched } from './touchedPanes';

beforeEach(() => {
  vi.clearAllMocks();
  resetReaped();
  resetAlerts();
  resetExited();
  resetTouched();
});

describe('reapPanes', () => {
  it('kills the Go session of every removed pane', () => {
    reapPanes(['p1', 'p2']);
    expect(coreBridge.kill).toHaveBeenCalledWith('p1');
    expect(coreBridge.kill).toHaveBeenCalledWith('p2');
    expect(coreBridge.kill).toHaveBeenCalledTimes(2);
  });

  it('tombstones reaped panes (for the spawn-race check and pty:exited skip)', () => {
    reapPanes(['p1']);
    expect(reapedPanes.has('p1')).toBe(true);
    expect(reapedPanes.has('other')).toBe(false);
  });

  it('drops the pane runtime-registry entries (alerts, exited, touched)', () => {
    bell('p1', 2);
    markExited('p1', 0);
    touchedPanes.mark('p1');
    reapPanes(['p1']);
    expect(alerts.counts['p1']).toBeUndefined();
    expect('p1' in exitedPanes.codes).toBe(false);
    expect(touchedPanes.isTouched('p1')).toBe(false);
  });

  it('swallows a kill rejection (session may already be gone)', async () => {
    vi.mocked(coreBridge.kill).mockRejectedValueOnce(new Error('unknown pane'));
    expect(() => reapPanes(['dead'])).not.toThrow();
    await new Promise((r) => setTimeout(r, 0)); // flush the rejection — must not surface
    expect(reapedPanes.has('dead')).toBe(true);
  });
});
