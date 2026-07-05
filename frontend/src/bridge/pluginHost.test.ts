import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ created: [] as any[] }));

vi.mock('./pluginSandbox', () => ({
  createSandbox: (code: string, onMsg: (d: unknown) => void, onErr: (e: string) => void) => {
    const sb = {
      code, onMsg, onErr, posted: [] as unknown[], terminated: false,
      post(m: unknown) { this.posted.push(m); },
      terminate() { this.terminated = true; },
    };
    h.created.push(sb);
    return sb;
  },
}));
vi.mock('./plugins', () => ({
  pluginsBridge: { list: vi.fn(), readFile: vi.fn(), storageGet: vi.fn(), storageSet: vi.fn() },
}));
vi.mock('./toast.svelte', () => ({ pushToast: vi.fn() }));
// pluginApi (imported via pluginHost) pulls in ./core, ./ptyEvents and store.svelte,
// which at import-time load @wailsio/runtime (touches window) — in vitest's node environment
// that fails. We mock them (like ./plugins/./toast above) to isolate the manager.
vi.mock('./core', () => ({ coreBridge: { write: vi.fn() } }));
vi.mock('./ptyEvents', () => ({ ptyEvents: { isLive: vi.fn(), setPluginPoster: vi.fn(), unsubscribePlugin: vi.fn(), register: vi.fn(), unregister: vi.fn(), markLive: vi.fn() } }));

import { init, activate, deactivate, pluginHost, sendUiEvent, terminateAll, __resetForTests, broadcastStateChanged } from './pluginHost.svelte';
import { pluginsBridge } from './plugins';
import { pushToast } from './toast.svelte';
import { ptyEvents } from './ptyEvents';
import { pluginViewBridge } from './pluginViewBridge';
import { EMPTY_CONTRIBUTIONS } from '../state/pluginContributions';

const flush = () => new Promise((r) => setTimeout(r));

beforeEach(() => {
  __resetForTests();
  h.created.length = 0;
  vi.clearAllMocks();
  (pluginsBridge.readFile as any).mockResolvedValue(new TextEncoder().encode('//code'));
});

describe('pluginHost', () => {
  it('init activates only enabled valid plugins and sends activate', async () => {
    (pluginsBridge.list as any).mockResolvedValue([
      { enabled: true, err: '', manifest: { id: 'p1', name: 'P1', entry: 'main.js' } },
      { enabled: false, err: '', manifest: { id: 'p2', name: 'P2', entry: 'main.js' } },
      { enabled: true, err: 'broken', manifest: null },
    ]);
    await init();
    expect(pluginHost.active.map((p) => p.id)).toEqual(['p1']);
    expect(h.created).toHaveLength(1);
    expect(h.created[0].posted[0]).toMatchObject({ type: 'event', name: 'activate', data: { pluginId: 'p1' } });
  });

  it('init does not crash if list rejects', async () => {
    (pluginsBridge.list as any).mockRejectedValue(new Error('no bindings'));
    await init();
    expect(pluginHost.active).toHaveLength(0);
  });

  it('rpc notify → pushToast + rpcResult ok', async () => {
    (pluginsBridge.list as any).mockResolvedValue([
      { enabled: true, err: '', manifest: { id: 'p1', name: 'P1', entry: 'main.js' } },
    ]);
    await init();
    const sb = h.created[0];
    sb.onMsg({ v: 1, type: 'rpc', id: 7, method: 'notify', args: ['hi'] });
    await flush();
    expect(pushToast).toHaveBeenCalledWith('p1', 'hi');
    expect(sb.posted[sb.posted.length - 1]).toMatchObject({ type: 'rpc-result', id: 7, ok: true });
  });

  it('ui.update writes into the plugin\'s reactive ui', async () => {
    (pluginsBridge.list as any).mockResolvedValue([
      { enabled: true, err: '', manifest: { id: 'p1', name: 'P1', entry: 'main.js' } },
    ]);
    await init();
    h.created[0].onMsg({ v: 1, type: 'rpc', id: 1, method: 'ui.update', args: ['demo.status', { text: 'x' }] });
    await flush();
    expect(pluginHost.active[0].ui['demo.status']).toEqual({ text: 'x' });
  });

  it('unknown method → rpcError', async () => {
    (pluginsBridge.list as any).mockResolvedValue([
      { enabled: true, err: '', manifest: { id: 'p1', name: 'P1', entry: 'main.js' } },
    ]);
    await init();
    const sb = h.created[0];
    sb.onMsg({ v: 1, type: 'rpc', id: 9, method: 'no-such-method', args: [] });
    await flush();
    const last = sb.posted[sb.posted.length - 1] as any;
    expect(last).toMatchObject({ type: 'rpc-result', id: 9, ok: false });
    expect(last.error).toContain('unknown method');
  });

  it('sendUiEvent posts a ui-event to the active plugin', async () => {
    (pluginsBridge.list as any).mockResolvedValue([
      { enabled: true, err: '', manifest: { id: 'p1', name: 'P1', entry: 'main.js' } },
    ]);
    await init();
    sendUiEvent('p1', { action: 'probe' });
    expect(h.created[0].posted.some((m: any) => m.type === 'event' && m.name === 'ui-event')).toBe(true);
  });

  it('terminateAll sends deactivate, terminates and clears the registry', async () => {
    (pluginsBridge.list as any).mockResolvedValue([
      { enabled: true, err: '', manifest: { id: 'p1', name: 'P1', entry: 'main.js' } },
    ]);
    await init();
    const sb = h.created[0];
    terminateAll();
    expect(sb.posted.some((m: any) => m.name === 'deactivate')).toBe(true);
    expect(sb.terminated).toBe(true);
    expect(pluginHost.active).toHaveLength(0);
  });

  it('activate does not add the plugin if readFile fails', async () => {
    (pluginsBridge.list as any).mockResolvedValue([
      { enabled: true, err: '', manifest: { id: 'p1', name: 'P1', entry: 'main.js' } },
    ]);
    (pluginsBridge.readFile as any).mockRejectedValueOnce(new Error('boom'));
    await init();
    expect(pluginHost.active).toHaveLength(0);
    expect(h.created).toHaveLength(0);
  });

  it('a repeat init does not create a duplicate plugin (guard)', async () => {
    (pluginsBridge.list as any).mockResolvedValue([
      { enabled: true, err: '', manifest: { id: 'p1', name: 'P1', entry: 'main.js' } },
    ]);
    await init();
    await init();
    expect(pluginHost.active).toHaveLength(1);
    expect(h.created).toHaveLength(1);
  });

  it('deactivate(id) sends deactivate, terminates and removes ONLY that plugin', async () => {
    (pluginsBridge.list as any).mockResolvedValue([
      { enabled: true, err: '', manifest: { id: 'p1', name: 'P1', entry: 'main.js' } },
      { enabled: true, err: '', manifest: { id: 'p2', name: 'P2', entry: 'main.js' } },
    ]);
    await init();
    const sb1 = h.created[0];
    deactivate('p1');
    expect(sb1.posted.some((m: any) => m.name === 'deactivate')).toBe(true);
    expect(sb1.terminated).toBe(true);
    expect(pluginHost.active.map((p) => p.id)).toEqual(['p2']);
    expect(pluginHost.log.some((e) => e.pluginId === 'p1' && e.line === 'deactivated')).toBe(true);
  });

  it('deactivate(id) for an inactive plugin — no-op', () => {
    __resetForTests();
    deactivate('nope');
    expect(pluginHost.active).toHaveLength(0);
  });

  it('activate(manifest) activates one plugin and is idempotent', async () => {
    __resetForTests();
    await activate({ id: 'x', name: 'X', entry: 'main.js' } as any);
    await activate({ id: 'x', name: 'X', entry: 'main.js' } as any);
    expect(pluginHost.active.map((p) => p.id)).toEqual(['x']);
    expect(h.created).toHaveLength(1);
  });

  it('deactivate removes the plugin\'s terminal subscriptions', async () => {
    await activate({ id: 'pw', name: 'W', entry: 'main.js', permissions: ['terminal:read'] } as any);
    deactivate('pw');
    expect(ptyEvents.unsubscribePlugin).toHaveBeenCalledWith('pw');
  });

  it('terminateAll removes the subscriptions of every plugin', async () => {
    await activate({ id: 'pw', name: 'W', entry: 'main.js' } as any);
    terminateAll();
    expect(ptyEvents.unsubscribePlugin).toHaveBeenCalledWith('pw');
  });

  it('init calls setPluginPoster on initialization', async () => {
    vi.mocked(ptyEvents.setPluginPoster).mockClear();
    (pluginsBridge.list as any).mockResolvedValue([]);
    await init();
    expect(ptyEvents.setPluginPoster).toHaveBeenCalledTimes(1);
  });

  it('broadcastStateChanged posts a state-changed event to every active sandbox', () => {
    __resetForTests();
    const postA = vi.fn();
    const postB = vi.fn();
    pluginHost.active = [
      { id: 'a', name: 'A', sandbox: { post: postA, terminate: vi.fn() } as any, ui: {}, contributes: {} as any, error: null, permissions: [] },
      { id: 'b', name: 'B', sandbox: { post: postB, terminate: vi.fn() } as any, ui: {}, contributes: {} as any, error: null, permissions: [] },
    ];
    const snap = { activeSpaceId: 'sp1', spaces: [] };

    broadcastStateChanged(snap);

    for (const post of [postA, postB]) {
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'event', name: 'state-changed', data: snap }),
      );
    }
  });

  it('deactivate unregisters the plugin from the view bridge', () => {
    const spy = vi.spyOn(pluginViewBridge, 'unregisterPlugin');
    // activate a fake plugin minimally through the active registry
    pluginHost.active = [{ id: 'p1', name: 'P1', sandbox: { post: () => {}, terminate: () => {} } as any, ui: {}, error: null, permissions: [], contributes: EMPTY_CONTRIBUTIONS }];
    deactivate('p1');
    expect(spy).toHaveBeenCalledWith('p1');
    spy.mockRestore();
  });
});
