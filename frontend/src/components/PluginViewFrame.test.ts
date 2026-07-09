// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';

const { reg, unreg } = vi.hoisted(() => ({ reg: vi.fn(), unreg: vi.fn() }));
vi.mock('../bridge/pluginViewBridge', () => ({ pluginViewBridge: { register: reg, unregister: unreg } }));
vi.mock('../bridge/dragState.svelte', () => ({ dragState: { dragId: null } }));

import PluginViewFrame from './PluginViewFrame.svelte';

afterEach(() => { cleanup(); reg.mockClear(); unreg.mockClear(); });

describe('PluginViewFrame', () => {
  it('renders a sandboxed iframe at the plugin asset path', () => {
    const { container } = render(PluginViewFrame, { props: { pluginId: 'p', entry: 'panel.html', frameId: 'panel:right:p:dash' } });
    const f = container.querySelector('iframe.view') as HTMLIFrameElement;
    expect(f).toBeTruthy();
    expect(f.getAttribute('sandbox')).toBe('allow-scripts');
    expect(f.getAttribute('src')).toBe('/plugins/p/panel.html');
  });
  it('registers frameId on iframe load and unregisters on destroy', async () => {
    const { container, unmount } = render(PluginViewFrame, { props: { pluginId: 'p', entry: 'panel.html', frameId: 'panel:right:p:dash' } });
    const f = container.querySelector('iframe.view') as HTMLIFrameElement;
    f.dispatchEvent(new Event('load'));
    expect(reg).toHaveBeenCalledWith('panel:right:p:dash', 'p', expect.anything());
    unmount();
    expect(unreg).toHaveBeenCalledWith('panel:right:p:dash', expect.anything());
  });
});
