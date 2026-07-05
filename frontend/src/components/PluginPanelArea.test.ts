// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import PluginPanelArea from './PluginPanelArea.svelte';
import type { ResolvedPanel } from '../state/pluginSlots';

afterEach(cleanup);

const panel = (id: string, title: string, widgets: ResolvedPanel['widgets'] = []): ResolvedPanel =>
  ({ pluginId: 'p', id, title, location: 'bottom', widgets });

describe('PluginPanelArea', () => {
  it('empty → placeholder', () => {
    const { getByText } = render(PluginPanelArea, { props: { panels: [], activeId: null, onSelectTab: vi.fn(), onCommand: vi.fn() } });
    expect(getByText('no active panels')).toBeTruthy();
  });

  it('one panel → body without tabs', () => {
    const panels = [panel('a', 'Alpha', [{ type: 'text', text: 'hi', tone: 'default' }])];
    const { getByText, container } = render(PluginPanelArea, { props: { panels, activeId: 'a', onSelectTab: vi.fn(), onCommand: vi.fn() } });
    expect(getByText('hi')).toBeTruthy();
    expect(container.querySelector('.tab')).toBeNull();
  });

  it('>1 panel → tabs; clicking a tab calls onSelectTab', async () => {
    const panels = [panel('a', 'Alpha'), panel('b', 'Beta')];
    const onSelectTab = vi.fn();
    const { getByText } = render(PluginPanelArea, { props: { panels, activeId: 'a', onSelectTab, onCommand: vi.fn() } });
    await fireEvent.click(getByText('Beta'));
    expect(onSelectTab).toHaveBeenCalledWith('b');
  });

  it('clicking a widget button forwards onCommand with pluginId', async () => {
    const panels = [panel('a', 'Alpha', [{ type: 'buttons', items: [{ text: 'Go', command: 'cmd' }] }])];
    const onCommand = vi.fn();
    const { getByText } = render(PluginPanelArea, { props: { panels, activeId: 'a', onSelectTab: vi.fn(), onCommand } });
    await fireEvent.click(getByText('Go'));
    expect(onCommand).toHaveBeenCalledWith('p', 'cmd', undefined);
  });
});

// S2.5 regression asserts: tab-bar contract
it('one panel → tab bar is not rendered', () => {
  const { container } = render(PluginPanelArea, { props: { panels: [panel('a', 'Alpha')], activeId: 'a', onSelectTab: vi.fn(), onCommand: vi.fn() } });
  expect(container.querySelector('.tabs')).toBeNull();
});

it('>1 panel → the active tab has the .active class', () => {
  const panels = [panel('a', 'Alpha'), panel('b', 'Beta')];
  const { getByText } = render(PluginPanelArea, { props: { panels, activeId: 'b', onSelectTab: vi.fn(), onCommand: vi.fn() } });
  expect((getByText('Beta').closest('.tab') as HTMLElement).classList.contains('active')).toBe(true);
  expect((getByText('Alpha').closest('.tab') as HTMLElement).classList.contains('active')).toBe(false);
});

const panelWithHeader = (header?: any) => ({ pluginId: 'p', id: 'p.panel', title: 'Usage', location: 'right' as const, widgets: [], ...(header ? { header } : {}) });

describe('PluginPanelArea header', () => {
  it('renders header title + action, action fires onCommand', async () => {
    const onCommand = vi.fn();
    const { getByText, container } = render(PluginPanelArea, { props: { panels: [panelWithHeader({ title: 'Usage Watcher', icon: '⏱', actions: [{ icon: '⚙', command: 'p.settings' }] })], activeId: 'p.panel', onSelectTab: () => {}, onCommand } });
    expect(getByText('Usage Watcher')).toBeTruthy();
    await fireEvent.click(container.querySelector('.hdr-action') as HTMLElement);
    expect(onCommand).toHaveBeenCalledWith('p', 'p.settings', undefined);
  });
  it('no header → no header bar', () => {
    const { container } = render(PluginPanelArea, { props: { panels: [panelWithHeader()], activeId: 'p.panel', onSelectTab: () => {}, onCommand: () => {} } });
    expect(container.querySelector('.panel-hdr')).toBeFalsy();
  });
});
