import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ byName: vi.fn() }));
vi.mock('@wailsio/runtime', () => ({ Call: { ByName: h.byName } }));

import { pluginsBridge, __resetPrefixForTests } from './plugins';

beforeEach(() => { h.byName.mockReset(); __resetPrefixForTests(); });

describe('pluginsBridge', () => {
  it('list resolves the first prefix and returns plugins', async () => {
    h.byName.mockResolvedValue([{ dir: 'd', manifest: null, enabled: false, permissions: [], err: '' }]);
    const list = await pluginsBridge.list();
    expect(list).toHaveLength(1);
    expect(h.byName).toHaveBeenCalledWith('main.PluginsApp.PluginsList');
  });

  it('resolves the second prefix if the first is unknown', async () => {
    h.byName
      .mockRejectedValueOnce(new Error('unknown bound method'))  // probe of main.* fails
      .mockResolvedValueOnce([])                                 // probe of github.com/tilzio/tilzio.* ok (cached)
      .mockResolvedValueOnce([{ dir: 'd', manifest: null, enabled: true, permissions: [], err: '' }]); // real list
    const list = await pluginsBridge.list();
    expect(list).toHaveLength(1);
    expect(h.byName).toHaveBeenNthCalledWith(1, 'main.PluginsApp.PluginsList');
    expect(h.byName).toHaveBeenNthCalledWith(2, 'github.com/tilzio/tilzio.PluginsApp.PluginsList');
    expect(h.byName).toHaveBeenNthCalledWith(3, 'github.com/tilzio/tilzio.PluginsApp.PluginsList');
  });

  it('storageGet: ErrNotFound → null', async () => {
    h.byName
      .mockResolvedValueOnce([])                                // resolve probe
      .mockRejectedValueOnce(new Error('plugins: not found'));  // StorageGet
    expect(await pluginsBridge.storageGet('p1', 'k')).toBeNull();
  });

  it('storageGet: other error is propagated', async () => {
    h.byName.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('network boom'));
    await expect(pluginsBridge.storageGet('p1', 'k')).rejects.toThrow('network boom');
  });

  it('storageGet parses a JSON string', async () => {
    h.byName.mockResolvedValueOnce([]).mockResolvedValueOnce('{"n":5}');
    expect(await pluginsBridge.storageGet('p1', 'k')).toEqual({ n: 5 });
  });

  it('storageGet: empty response → null', async () => {
    h.byName.mockResolvedValueOnce([]).mockResolvedValueOnce('');
    expect(await pluginsBridge.storageGet('p1', 'k')).toBeNull();
  });

  it('storageSet stringifies the value', async () => {
    h.byName.mockResolvedValue(undefined);
    await pluginsBridge.storageSet('p1', 'k', { n: 2 });
    expect(h.byName).toHaveBeenLastCalledWith('main.PluginsApp.PluginStorageSet', 'p1', 'k', '{"n":2}');
  });

  it('installZip encodes bytes to base64 and calls PluginInstallZip', async () => {
    h.byName
      .mockResolvedValueOnce([])                                              // prefix probe
      .mockResolvedValueOnce({ status: 'installed', info: { dir: 'd', manifest: null, enabled: false, permissions: [], err: '' } });
    const res = await pluginsBridge.installZip(new Uint8Array([1, 2, 3]), false);
    expect(res.status).toBe('installed');
    expect(h.byName).toHaveBeenLastCalledWith('main.PluginsApp.PluginInstallZip', 'AQID', false);
  });

  it('installZip propagates the conflict result', async () => {
    h.byName
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ status: 'conflict', conflict: { id: 'p', existingVersion: '1.0.0', newVersion: '2.0.0' } });
    const res = await pluginsBridge.installZip(new Uint8Array([1]), false);
    expect(res.status).toBe('conflict');
    expect(res.conflict).toEqual({ id: 'p', existingVersion: '1.0.0', newVersion: '2.0.0' });
  });

  it('installURL calls PluginInstallURL with url and overwrite', async () => {
    h.byName.mockResolvedValueOnce([]).mockResolvedValueOnce({ status: 'installed' });
    await pluginsBridge.installURL('https://x/p.zip', true);
    expect(h.byName).toHaveBeenLastCalledWith('main.PluginsApp.PluginInstallURL', 'https://x/p.zip', true);
  });

  it('uninstall calls PluginUninstall with the folder name', async () => {
    h.byName.mockResolvedValueOnce([]).mockResolvedValueOnce(undefined);
    await pluginsBridge.uninstall('ts-demo');
    expect(h.byName).toHaveBeenLastCalledWith('main.PluginsApp.PluginUninstall', 'ts-demo');
  });

  it('storageInfo calls PluginStorageInfo and returns {keys,bytes}', async () => {
    h.byName.mockResolvedValueOnce([]).mockResolvedValueOnce({ keys: 3, bytes: 128 });
    const r = await pluginsBridge.storageInfo('dev.term.git');
    expect(r).toEqual({ keys: 3, bytes: 128 });
    expect(h.byName).toHaveBeenLastCalledWith('main.PluginsApp.PluginStorageInfo', 'dev.term.git');
  });

  it('exec calls PluginExec with id/bin/args/cwd and returns the result', async () => {
    h.byName.mockReset();
    h.byName.mockImplementation((name: string) => {
      if (name.endsWith('.PluginsList')) return Promise.resolve([]);   // prefix probe ok
      if (name.endsWith('.PluginExec'))  return Promise.resolve({ stdout: 'main\n', stderr: '', code: 0, truncated: false });
      return Promise.reject(new Error('unexpected ' + name));
    });
    __resetPrefixForTests();

    const res = await pluginsBridge.exec('dev.term.git', 'git', ['branch', '--show-current'], '/repo');

    expect(res).toEqual({ stdout: 'main\n', stderr: '', code: 0, truncated: false });
    expect(h.byName).toHaveBeenCalledWith(
      expect.stringMatching(/\.PluginExec$/), 'dev.term.git', 'git', ['branch', '--show-current'], '/repo',
    );
  });

  it('storageClear calls PluginStorageClear with id', async () => {
    h.byName.mockResolvedValueOnce([]).mockResolvedValueOnce(undefined);
    await pluginsBridge.storageClear('dev.term.git');
    expect(h.byName).toHaveBeenLastCalledWith('main.PluginsApp.PluginStorageClear', 'dev.term.git');
  });
});
