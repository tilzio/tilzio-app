// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  storeInstall: vi.fn(),
  activate: vi.fn(),
  deactivate: vi.fn(),
  host: { active: [] as { id: string }[], log: [] },
}));
vi.mock('./plugins', () => ({ pluginsBridge: { storeInstall: h.storeInstall } }));
vi.mock('./pluginHost.svelte', () => ({
  pluginHost: h.host,
  activate: h.activate,
  deactivate: h.deactivate,
}));

import { storeInstall } from './storeActions';

const manifest = { id: 'a', name: 'A', version: '2.0.0', engine: 'tilzio@1', entry: 'main.js' };

beforeEach(() => {
  h.storeInstall.mockReset();
  h.activate.mockReset();
  h.deactivate.mockReset();
  h.host.active = [];
});

describe('storeInstall orchestration', () => {
  it('inactive plugin: installs without touching the worker', async () => {
    h.storeInstall.mockResolvedValue({ status: 'installed', info: { manifest, enabled: false } });
    const res = await storeInstall('a');
    expect(res.status).toBe('installed');
    expect(h.deactivate).not.toHaveBeenCalled();
    expect(h.activate).not.toHaveBeenCalled();
  });

  it('active plugin: deactivate → install → activate with the NEW manifest', async () => {
    h.host.active = [{ id: 'a' }];
    h.storeInstall.mockResolvedValue({ status: 'installed', info: { manifest, enabled: true } });
    await storeInstall('a');
    expect(h.deactivate).toHaveBeenCalledWith('a');
    expect(h.activate).toHaveBeenCalledWith(manifest);
    // Order: deactivate strictly before install, install before activate.
    expect(h.deactivate.mock.invocationCallOrder[0]).toBeLessThan(h.storeInstall.mock.invocationCallOrder[0]);
    expect(h.storeInstall.mock.invocationCallOrder[0]).toBeLessThan(h.activate.mock.invocationCallOrder[0]);
  });

  it('active plugin + failed install: worker stays down, error propagates', async () => {
    h.host.active = [{ id: 'a' }];
    h.storeInstall.mockRejectedValue(new Error('sha mismatch'));
    await expect(storeInstall('a')).rejects.toThrow('sha mismatch');
    expect(h.deactivate).toHaveBeenCalledWith('a');
    expect(h.activate).not.toHaveBeenCalled();
  });
});
