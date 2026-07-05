// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import PluginPane from './PluginPane.svelte';
import { pluginHost, __resetForTests as resetHost } from '../bridge/pluginHost.svelte';
import { EMPTY_CONTRIBUTIONS } from '../state/pluginContributions';
import { beginDrag, endDrag } from '../bridge/dragState.svelte';

const noop = () => {};
const baseProps = { paneId: 'pane1', pluginId: 'p1', viewId: 'main', active: false, zoomed: false,
  onFocus: noop, onSplit: noop, onClose: noop, onZoom: noop, onOpenExtensions: noop };

// Makes the view «live» so PluginPane renders an <iframe>.
function activateLiveView() {
  pluginHost.active = [{ id: 'p1', name: 'P1', sandbox: null, ui: {}, error: null, permissions: [],
    contributes: { ...EMPTY_CONTRIBUTIONS, views: [{ id: 'main', title: 'T', entry: 'view.html' }] } }];
}

describe('PluginPane', () => {
  beforeEach(() => { resetHost(); endDrag(); });
  afterEach(() => { cleanup(); endDrag(); });

  it('renders an iframe with the /plugins/<id>/<entry> src when the view is live', () => {
    pluginHost.active = [{ id: 'p1', name: 'P1', sandbox: null, ui: {}, error: null, permissions: [],
      contributes: { ...EMPTY_CONTRIBUTIONS, views: [{ id: 'main', title: 'T', entry: 'view.html' }] } }];
    const { container } = render(PluginPane, { props: baseProps });
    const iframe = container.querySelector('iframe')!;
    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute('src')).toBe('/plugins/p1/view.html');
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
  });

  it('renders a placeholder (no iframe) when the plugin is not active', () => {
    pluginHost.active = [];
    const { container, getByText } = render(PluginPane, { props: baseProps });
    expect(container.querySelector('iframe')).toBeNull();
    expect(getByText(/unavailable/i)).toBeTruthy();
  });

  it('renders "view unavailable" when active but the view is not declared', () => {
    pluginHost.active = [{ id: 'p1', name: 'P1', sandbox: null, ui: {}, error: null, permissions: [],
      contributes: { ...EMPTY_CONTRIBUTIONS, views: [] } }];
    const { container, getByText } = render(PluginPane, { props: baseProps });
    expect(container.querySelector('iframe')).toBeNull();
    expect(getByText(/view unavailable/i)).toBeTruthy();
  });

  // WKWebView: a cross-origin sandbox iframe swallows HTML5 dragover/drop and doesn't forward
  // them to the SplitContainer .leaf wrapper (no zone highlight, the drop is lost). We fix it
  // with an overlay (.drag-catcher) — plain DOM in the parent document over the iframe for the
  // duration of the drag: events bubble up to the wrapper. WebKit ignores pointer-events:none on
  // the iframe itself for DnD, so we cover it rather than make it transparent.
  it('does not overlay a drag-catcher at rest (no active pane drag)', () => {
    activateLiveView();
    const { container } = render(PluginPane, { props: baseProps });
    expect(container.querySelector('.drag-catcher')).toBeNull();
  });

  it('overlays a drag-catcher above the iframe while a pane drag is active', async () => {
    activateLiveView();
    const { container } = render(PluginPane, { props: baseProps });
    expect(container.querySelector('iframe')).toBeTruthy();

    beginDrag('some-other-pane');
    await tick();

    expect(container.querySelector('.drag-catcher')).toBeTruthy();
  });

  it('removes the drag-catcher when the pane drag ends', async () => {
    activateLiveView();
    const { container } = render(PluginPane, { props: baseProps });

    beginDrag('some-other-pane');
    await tick();
    expect(container.querySelector('.drag-catcher')).toBeTruthy();

    endDrag();
    await tick();
    expect(container.querySelector('.drag-catcher')).toBeNull();
  });
});
