import { describe, it, expect, vi, beforeEach } from 'vitest';
import { paneRestart, __resetForTests } from './paneRestart';

beforeEach(() => __resetForTests());

describe('paneRestart', () => {
  it('calls the registered restart fn for a pane', () => {
    const fn = vi.fn();
    paneRestart.register('p1', fn);
    paneRestart.restart('p1');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for an unregistered pane', () => {
    expect(() => paneRestart.restart('ghost')).not.toThrow();
  });

  it('unregister stops delivery', () => {
    const fn = vi.fn();
    paneRestart.register('p1', fn);
    paneRestart.unregister('p1');
    paneRestart.restart('p1');
    expect(fn).not.toHaveBeenCalled();
  });
});
