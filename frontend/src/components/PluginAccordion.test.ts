// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
vi.mock('../bridge/pluginViewBridge', () => ({ pluginViewBridge: { register: vi.fn(), unregister: vi.fn() } }));
vi.mock('../bridge/dragState.svelte', () => ({ dragState: { dragId: null } }));
vi.mock('../bridge/pluginTheme', () => ({ postTheme: vi.fn(), TS_THEME_TOKENS: {} }));
import PluginAccordion from './PluginAccordion.svelte';
import type { ResolvedPanel } from '../state/pluginSlots';

afterEach(cleanup);
const wp = (id: string): ResolvedPanel => ({ pluginId: 'p', id, title: id.toUpperCase(), location: 'right', render: 'widgets', widgets: [{ type: 'text', text: id + '-body', tone: 'default' }] });
const ip = (id: string): ResolvedPanel => ({ pluginId: 'p', id, title: id.toUpperCase(), location: 'right', render: 'iframe', entry: 'panel.html', widgets: [] });

describe('PluginAccordion', () => {
  it('empty → placeholder', () => {
    const { getByText } = render(PluginAccordion, { props: { panels: [], collapsed: {}, onToggle: vi.fn(), onClose: vi.fn(), onCommand: vi.fn() } });
    expect(getByText('no active panels')).toBeTruthy();
  });
  it('renders a section header per panel; iframe panel gets a sandboxed frame', () => {
    const { getByText, container } = render(PluginAccordion, { props: { panels: [wp('a'), ip('b')], collapsed: {}, onToggle: vi.fn(), onClose: vi.fn(), onCommand: vi.fn() } });
    expect(getByText('A')).toBeTruthy();
    expect(getByText('B')).toBeTruthy();
    expect(getByText('a-body')).toBeTruthy();
    const f = container.querySelector('iframe.view') as HTMLIFrameElement;
    expect(f.getAttribute('src')).toBe('/plugins/p/panel.html');
  });
  it('collapsed section hides its body', () => {
    const { queryByText } = render(PluginAccordion, { props: { panels: [wp('a')], collapsed: { a: true }, onToggle: vi.fn(), onClose: vi.fn(), onCommand: vi.fn() } });
    expect(queryByText('a-body')).toBeNull();
  });
  it('header toggle and close fire callbacks', async () => {
    const onToggle = vi.fn(); const onClose = vi.fn();
    const { getByLabelText } = render(PluginAccordion, { props: { panels: [wp('a')], collapsed: {}, onToggle, onClose, onCommand: vi.fn() } });
    await fireEvent.click(getByLabelText('collapse A'));
    expect(onToggle).toHaveBeenCalledWith('a');
    await fireEvent.click(getByLabelText('close A'));
    expect(onClose).toHaveBeenCalledWith('a');
  });
});
