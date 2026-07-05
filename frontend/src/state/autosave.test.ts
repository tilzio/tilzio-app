import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './autosave';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('debounce', () => {
  it('fires once after the delay, coalescing rapid schedules', () => {
    const fn = vi.fn();
    const d = debounce(fn, 500);
    d.schedule();
    d.schedule();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('flush fires immediately and cancels the pending timer', () => {
    const fn = vi.fn();
    const d = debounce(fn, 500);
    d.schedule();
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('flush with nothing pending does nothing', () => {
    const fn = vi.fn();
    debounce(fn, 500).flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it('cancel suppresses the pending call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 500);
    d.schedule();
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});
