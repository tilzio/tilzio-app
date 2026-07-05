import { describe, it, expect, vi, beforeEach } from 'vitest';

const order: string[] = [];
vi.mock('./plugins', () => ({
  pluginsBridge: { installZip: vi.fn(), installURL: vi.fn(), uninstall: vi.fn() },
}));
// Fully mock the host (its real import pulls in window-dependent modules).
vi.mock('./pluginHost.svelte', () => ({
  activate: vi.fn(async () => { order.push('activate'); }),
  deactivate: vi.fn(() => { order.push('deactivate'); }),
  pluginHost: { active: [] as { id: string }[] },
}));

import { installBytes, installUrl, uninstallPlugin } from './pluginInstall';
import { pluginsBridge } from './plugins';
import { activate, deactivate, pluginHost } from './pluginHost.svelte';

beforeEach(() => { order.length = 0; vi.clearAllMocks(); pluginHost.active = []; });

describe('pluginInstall', () => {
  it('installed immediately → installed:true, onConflict not called', async () => {
    (pluginsBridge.installZip as any).mockResolvedValueOnce({ status: 'installed', info: { manifest: { id: 'p' } } });
    const onConflict = vi.fn();
    const r = await installBytes(new Uint8Array([1]), { onConflict });
    expect(r).toEqual({ installed: true });
    expect(onConflict).not.toHaveBeenCalled();
    expect(pluginsBridge.installZip).toHaveBeenCalledWith(expect.any(Uint8Array), false);
  });

  it('conflict → onConflict(true) → retry with overwrite=true', async () => {
    (pluginsBridge.installZip as any)
      .mockResolvedValueOnce({ status: 'conflict', conflict: { id: 'p', existingVersion: '1', newVersion: '2' } })
      .mockResolvedValueOnce({ status: 'installed', info: { manifest: { id: 'p' } } });
    const onConflict = vi.fn(async () => true);
    const r = await installBytes(new Uint8Array([1]), { onConflict });
    expect(onConflict).toHaveBeenCalledWith({ id: 'p', existingVersion: '1', newVersion: '2' });
    expect(r.installed).toBe(true);
    expect((pluginsBridge.installZip as any).mock.calls[1][1]).toBe(true);
  });

  it('conflict → onConflict(false) → cancel, no retry', async () => {
    (pluginsBridge.installZip as any).mockResolvedValueOnce({ status: 'conflict', conflict: { id: 'p', existingVersion: '1', newVersion: '2' } });
    const r = await installBytes(new Uint8Array([1]), { onConflict: async () => false });
    expect(r).toEqual({ installed: false });
    expect(pluginsBridge.installZip).toHaveBeenCalledTimes(1);
  });

  it('updating an active plugin: deactivate BEFORE, activate AFTER on the new manifest', async () => {
    pluginHost.active = [{ id: 'p' }] as any;
    (pluginsBridge.installZip as any)
      .mockResolvedValueOnce({ status: 'conflict', conflict: { id: 'p', existingVersion: '1', newVersion: '2' } })
      .mockResolvedValueOnce({ status: 'installed', info: { manifest: { id: 'p', name: 'P', entry: 'main.js' } } });
    await installBytes(new Uint8Array([1]), { onConflict: async () => true });
    expect(deactivate).toHaveBeenCalledWith('p');
    expect(activate).toHaveBeenCalledWith({ id: 'p', name: 'P', entry: 'main.js' });
    expect(order).toEqual(['deactivate', 'activate']);
  });

  it('conflict of an INACTIVE plugin: neither deactivate nor activate', async () => {
    pluginHost.active = [];
    (pluginsBridge.installZip as any)
      .mockResolvedValueOnce({ status: 'conflict', conflict: { id: 'p', existingVersion: '1', newVersion: '2' } })
      .mockResolvedValueOnce({ status: 'installed', info: { manifest: { id: 'p' } } });
    await installBytes(new Uint8Array([1]), { onConflict: async () => true });
    expect(deactivate).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });

  it('installUrl: conflict → retry with overwrite=true via installURL', async () => {
    (pluginsBridge.installURL as any)
      .mockResolvedValueOnce({ status: 'conflict', conflict: { id: 'p', existingVersion: '1', newVersion: '2' } })
      .mockResolvedValueOnce({ status: 'installed', info: { manifest: { id: 'p' } } });
    const r = await installUrl('https://x/p.zip', { onConflict: async () => true });
    expect(r.installed).toBe(true);
    expect((pluginsBridge.installURL as any).mock.calls[0]).toEqual(['https://x/p.zip', false]);
    expect((pluginsBridge.installURL as any).mock.calls[1]).toEqual(['https://x/p.zip', true]);
  });
});

describe('uninstallPlugin', () => {
  it('active plugin → deactivate(id) + uninstall(dir)', async () => {
    pluginHost.active = [{ id: 'p' }] as any;
    (pluginsBridge.uninstall as any).mockResolvedValueOnce(undefined);
    await uninstallPlugin('p', 'dir-p');
    expect(deactivate).toHaveBeenCalledWith('p');
    expect(pluginsBridge.uninstall).toHaveBeenCalledWith('dir-p');
  });

  it('inactive plugin → only uninstall(dir), no deactivate', async () => {
    pluginHost.active = [];
    (pluginsBridge.uninstall as any).mockResolvedValueOnce(undefined);
    await uninstallPlugin('p', 'dir-p');
    expect(deactivate).not.toHaveBeenCalled();
    expect(pluginsBridge.uninstall).toHaveBeenCalledWith('dir-p');
  });

  it('broken plugin (id=null) → uninstall(dir), no deactivate', async () => {
    (pluginsBridge.uninstall as any).mockResolvedValueOnce(undefined);
    await uninstallPlugin(null, 'broken-dir');
    expect(deactivate).not.toHaveBeenCalled();
    expect(pluginsBridge.uninstall).toHaveBeenCalledWith('broken-dir');
  });
});
