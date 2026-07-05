import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { toasts, pushToast, pushActionToast, dismissToast, __resetForTests } from './toast.svelte';

beforeEach(() => { __resetForTests(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe('toast', () => {
  it('pushToast adds a toast', () => {
    pushToast('p1', 'hi');
    expect(toasts.items).toHaveLength(1);
    expect(toasts.items[0]).toMatchObject({ pluginId: 'p1', title: 'hi' });
  });

  it('dismissToast removes by id', () => {
    pushToast('p1', 'a');
    const id = toasts.items[0].id;
    dismissToast(id);
    expect(toasts.items).toHaveLength(0);
  });

  it('a toast auto-dismisses on timeout', () => {
    pushToast('p1', 'bye');
    expect(toasts.items).toHaveLength(1);
    vi.advanceTimersByTime(4000);
    expect(toasts.items).toHaveLength(0);
  });

  it('dismiss before timeout does not resurrect the toast', () => {
    pushToast('p1', 'x');
    dismissToast(toasts.items[0].id);
    vi.advanceTimersByTime(4000);
    expect(toasts.items).toHaveLength(0);
  });
});

describe('pushToast', () => {
  it('string payload → title only', () => {
    pushToast('p', 'hello');
    expect(toasts.items[0].title).toBe('hello');
    expect(toasts.items[0].body).toBeUndefined();
  });
  it('object payload → title/body/tone/icon', () => {
    pushToast('p', { title: 'T', body: 'B', tone: 'error', icon: '🔔' });
    const t = toasts.items[0];
    expect(t.title).toBe('T'); expect(t.body).toBe('B'); expect(t.tone).toBe('error'); expect(t.icon).toBe('🔔');
  });
});

describe('pushActionToast', () => {
  it('adds an action toast with kind/title/body/actions', () => {
    const id = pushActionToast({ title: 'tests · waiting for input', body: 'web › tests', actions: [{ label: 'Open pane', primary: true, onAct: () => {} }, { label: 'Later', onAct: () => {} }] });
    expect(typeof id).toBe('number');
    const t = toasts.items[0];
    expect(t).toMatchObject({ kind: 'action', title: 'tests · waiting for input', body: 'web › tests' });
    expect(t.actions).toHaveLength(2);
    expect(t.actions?.[0]).toMatchObject({ label: 'Open pane', primary: true });
  });
  it('persistent:true does not dismiss on timeout', () => {
    pushActionToast({ title: 'x', actions: [], persistent: true });
    vi.advanceTimersByTime(4000);
    expect(toasts.items).toHaveLength(1);
  });
  it('without persistent it dismisses after 4000ms', () => {
    pushActionToast({ title: 'x', actions: [] });
    vi.advanceTimersByTime(4000);
    expect(toasts.items).toHaveLength(0);
  });
  it('dismissToast(id) removes an action toast', () => {
    const id = pushActionToast({ title: 'x', actions: [], persistent: true });
    dismissToast(id);
    expect(toasts.items).toHaveLength(0);
  });
});
