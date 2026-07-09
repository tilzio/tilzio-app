import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pluginViewBridge } from './pluginViewBridge';

vi.mock('./plugins', () => ({
  pluginsBridge: { storageGet: vi.fn(), storageSet: vi.fn(), exec: vi.fn() },
}));
vi.mock('./toast.svelte', () => ({ pushToast: vi.fn() }));
vi.mock('./core', () => ({ coreBridge: { write: vi.fn().mockResolvedValue(undefined), loadScrollback: vi.fn() } }));
vi.mock('./ptyEvents', () => ({ ptyEvents: { isLive: vi.fn(), subscribePlugin: vi.fn(), unsubscribePluginSub: vi.fn() } }));
vi.mock('../state/selectors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../state/selectors')>();
  return { ...actual, findLeafInApp: vi.fn() };
});

import { isKnownMethod, dispatch } from './pluginApi';
import { pluginsBridge } from './plugins';
import { pushToast } from './toast.svelte';
import { coreBridge } from './core';
import { ptyEvents } from './ptyEvents';
import { store } from '../state/store.svelte';
import { findLeafInApp } from '../state/selectors';

beforeEach(() => vi.clearAllMocks());

const ctx = (sink: Record<string, unknown>) => ({
  pluginId: 'p1',
  setUi: (cid: string, d: unknown) => { sink[cid] = d; },
});

describe('pluginApi', () => {
  it('isKnownMethod: known methods yes, unknown ones no', () => {
    expect(isKnownMethod('ui.update')).toBe(true);
    expect(isKnownMethod('notify')).toBe(true);
    // SP-5: exec/state/terminal are now registered too
    expect(isKnownMethod('exec')).toBe(true);
    expect(isKnownMethod('state.get')).toBe(true);
    // a completely foreign method — no
    expect(isKnownMethod('totally.unknown')).toBe(false);
  });

  it('ui.update writes data through setUi', async () => {
    const sink: Record<string, unknown> = {};
    await dispatch(ctx(sink), 'ui.update', ['demo.status', { text: 'ok' }]);
    expect(sink['demo.status']).toEqual({ text: 'ok' });
  });

  it('notify triggers pushToast', async () => {
    await dispatch(ctx({}), 'notify', ['hello']);
    expect(pushToast).toHaveBeenCalledWith('p1', 'hello');
  });

  it('storage.get/set proxy to the bridge', async () => {
    (pluginsBridge.storageGet as any).mockResolvedValue({ n: 1 });
    const got = await dispatch(ctx({}), 'storage.get', ['k']);
    expect(got).toEqual({ n: 1 });
    expect(pluginsBridge.storageGet).toHaveBeenCalledWith('p1', 'k');
    await dispatch(ctx({}), 'storage.set', ['k', { n: 2 }]);
    expect(pluginsBridge.storageSet).toHaveBeenCalledWith('p1', 'k', { n: 2 });
  });

  it('unknown method → throws', async () => {
    await expect(dispatch(ctx({}), 'totally.unknown', [])).rejects.toThrow('unknown method');
  });
});

const simpleCtx = { pluginId: 'p1', setUi: () => {} };

describe('dispatch SP-5 capabilities', () => {
  beforeEach(() => {
    vi.mocked(coreBridge.write).mockClear();
    vi.mocked(ptyEvents.isLive).mockReset();
  });

  it('exec delegates to pluginsBridge.exec with pluginId/bin/args/cwd', async () => {
    const spy = vi.spyOn(pluginsBridge, 'exec').mockResolvedValue({ stdout: 'main\n', stderr: '', code: 0, truncated: false });
    const res = await dispatch(simpleCtx, 'exec', ['git', ['branch'], { cwd: '/r' }]);
    expect(spy).toHaveBeenCalledWith('p1', 'git', ['branch'], '/r');
    expect(res).toMatchObject({ stdout: 'main\n', code: 0 });
  });

  it('state.get returns a snapshot of the current store', async () => {
    store.app = {
      activeSpaceId: 'sp1',
      spaces: [{ id: 'sp1', name: 'S', collapsed: false, activeTabId: 't1',
        tabs: [{ id: 't1', title: 'T', activePaneId: 'p1', zoomedPaneId: null,
          root: { kind: 'terminal', id: 'p1', cwd: '/a' } }] }],
    } as any;
    const snap = await dispatch(simpleCtx, 'state.get', []) as { activeSpaceId: string };
    expect(snap.activeSpaceId).toBe('sp1');
  });

  it('terminal.paste writes text as-is (no newline) when pane is live', async () => {
    vi.mocked(ptyEvents.isLive).mockReturnValue(true);
    await dispatch(simpleCtx, 'terminal.paste', ['p1', 'git pull']);
    expect(coreBridge.write).toHaveBeenCalledWith('p1', 'git pull');
  });

  it('terminal.run appends exactly one newline when pane is live', async () => {
    vi.mocked(ptyEvents.isLive).mockReturnValue(true);
    await dispatch(simpleCtx, 'terminal.run', ['p1', 'git pull']);
    expect(coreBridge.write).toHaveBeenCalledWith('p1', 'git pull\n');
  });

  it('terminal.* rejects a non-live pane and does not write', async () => {
    vi.mocked(ptyEvents.isLive).mockReturnValue(false);
    await expect(dispatch(simpleCtx, 'terminal.run', ['ghost', 'x'])).rejects.toThrow(/not live/);
    expect(coreBridge.write).not.toHaveBeenCalled();
  });

  it('KNOWN_METHODS includes the new capabilities', () => {
    for (const m of ['exec', 'state.get', 'state.onChange', 'terminal.paste', 'terminal.run']) {
      expect(isKnownMethod(m)).toBe(true);
    }
  });
});

describe('dispatch SP-A terminal observe', () => {
  const ctxRead = { pluginId: 'p1', setUi: () => {}, permissions: ['terminal:read'] };
  const ctxNoPerm = { pluginId: 'p1', setUi: () => {}, permissions: [] as string[] };
  const ctxUndef = { pluginId: 'p1', setUi: () => {} };   // no permissions field
  beforeEach(() => { vi.mocked(ptyEvents.isLive).mockReset(); vi.mocked(findLeafInApp).mockReset(); });

  it('terminal.read without permission → throws (fail-closed)', async () => {
    await expect(dispatch(ctxNoPerm, 'terminal.read', ['t1'])).rejects.toThrow(/terminal:read/);
  });
  it('terminal.read with undefined permissions → also throws (fail-closed)', async () => {
    await expect(dispatch(ctxUndef as any, 'terminal.read', ['t1'])).rejects.toThrow(/terminal:read/);
  });
  it('terminal.read on an editor leaf → not a terminal', async () => {
    vi.mocked(findLeafInApp).mockReturnValue({ kind: 'editor', id: 't1', files: [] } as any);
    await expect(dispatch(ctxRead, 'terminal.read', ['t1'])).rejects.toThrow(/not a terminal/);
  });
  it('terminal.read on an unknown id → unknown pane', async () => {
    vi.mocked(findLeafInApp).mockReturnValue(undefined);
    await expect(dispatch(ctxRead, 'terminal.read', ['nope'])).rejects.toThrow(/unknown pane/);
  });
  it('terminal.read decodes scrollback into a string (no isLive gate)', async () => {
    vi.mocked(findLeafInApp).mockReturnValue({ kind: 'terminal', id: 't1', cwd: '/a' } as any);
    vi.mocked(ptyEvents.isLive).mockReturnValue(false);           // even a dead one — we read it
    vi.mocked(coreBridge.loadScrollback).mockResolvedValue(new TextEncoder().encode('hello'));
    expect(await dispatch(ctxRead, 'terminal.read', ['t1'])).toBe('hello');
  });
  it('terminal.subscribeOutput: permission + isLive → ptyEvents.subscribePlugin', async () => {
    vi.mocked(ptyEvents.isLive).mockReturnValue(true);
    await dispatch(ctxRead, 'terminal.subscribeOutput', ['t1', 'o1']);
    expect(ptyEvents.subscribePlugin).toHaveBeenCalledWith('p1', 't1', 'o1', 'output');
  });
  it('terminal.subscribeOutput on a dead pane → not live', async () => {
    vi.mocked(ptyEvents.isLive).mockReturnValue(false);
    await expect(dispatch(ctxRead, 'terminal.subscribeOutput', ['t1', 'o1'])).rejects.toThrow(/not live/);
  });
  it('terminal.unsubscribe → ptyEvents.unsubscribePluginSub', async () => {
    await dispatch(ctxRead, 'terminal.unsubscribe', ['o1']);
    expect(ptyEvents.unsubscribePluginSub).toHaveBeenCalledWith('p1', 'o1');
  });
  it('KNOWN_METHODS includes the new methods', () => {
    for (const m of ['terminal.read', 'terminal.subscribeOutput', 'terminal.subscribeExit', 'terminal.unsubscribe']) {
      expect(isKnownMethod(m)).toBe(true);
    }
  });
});

describe('dispatch SP-B view bridge', () => {
  it('dispatch view.post forwards to the view bridge by frameId', async () => {
    const spy = vi.spyOn(pluginViewBridge, 'postToFrame').mockImplementation(() => {});
    await dispatch({ pluginId: 'p1', setUi: () => {}, permissions: [] }, 'view.post', ['pane1', { a: 1 }]);
    expect(spy).toHaveBeenCalledWith('pane1', { a: 1 });
    spy.mockRestore();
  });
});
