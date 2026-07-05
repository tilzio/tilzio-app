import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: string[] = [];
const h = vi.hoisted(() => {
  const host: { active: { id: string }[] } = { active: [] };
  return { host };
});
vi.mock('./plugins', () => ({
  pluginsBridge: {
    setEnabled: vi.fn(async () => { calls.push('setEnabled'); }),
    storageClear: vi.fn(async () => { calls.push('storageClear'); }),
  },
}));
// Fully mock the host (its real import pulls in window-dependent modules).
vi.mock('./pluginHost.svelte', () => ({
  activate: vi.fn(async () => { calls.push('activate'); }),
  deactivate: vi.fn(() => { calls.push('deactivate'); }),
  pluginHost: h.host,
}));

import { enablePlugin, disablePlugin, resetPluginStorage } from './pluginManage';
import { pluginsBridge } from './plugins';
import { activate, deactivate } from './pluginHost.svelte';

const host = h.host;
beforeEach(() => { calls.length = 0; host.active = []; vi.clearAllMocks(); });

describe('pluginManage', () => {
  it('enablePlugin: setEnabled(id,true), then activate', async () => {
    const m = { id: 'p', name: 'P', entry: 'main.js' } as any;
    await enablePlugin(m);
    expect(pluginsBridge.setEnabled).toHaveBeenCalledWith('p', true);
    expect(activate).toHaveBeenCalledWith(m);
    expect(calls).toEqual(['setEnabled', 'activate']);
  });

  it('disablePlugin: setEnabled(id,false), then deactivate', async () => {
    await disablePlugin('p');
    expect(pluginsBridge.setEnabled).toHaveBeenCalledWith('p', false);
    expect(deactivate).toHaveBeenCalledWith('p');
    expect(calls).toEqual(['setEnabled', 'deactivate']);
  });

  it('resetPluginStorage: active plugin → clear, deactivate, activate', async () => {
    const m = { id: 'p', name: 'P', entry: 'main.js' } as any;
    host.active = [{ id: 'p' }];
    await resetPluginStorage(m, 'p');
    expect(pluginsBridge.storageClear).toHaveBeenCalledWith('p');
    expect(deactivate).toHaveBeenCalledWith('p');
    expect(activate).toHaveBeenCalledWith(m);
    expect(calls).toEqual(['storageClear', 'deactivate', 'activate']);
  });

  it('resetPluginStorage: inactive plugin → only clear', async () => {
    const m = { id: 'p', name: 'P', entry: 'main.js' } as any;
    host.active = [];
    await resetPluginStorage(m, 'p');
    expect(calls).toEqual(['storageClear']);
  });

  it('resetPluginStorage: manifest=null → only clear', async () => {
    host.active = [{ id: 'p' }];
    await resetPluginStorage(null, 'p');
    expect(calls).toEqual(['storageClear']);
  });
});
