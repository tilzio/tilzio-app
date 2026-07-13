// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import ActivityBar from './ActivityBar.svelte';
import type { ResolvedActivityButton } from '../state/pluginSlots';

afterEach(cleanup);

describe('ActivityBar', () => {
  it('clicking ☰ calls onToggleSidebar', async () => {
    const onToggleSidebar = vi.fn();
    const { getByLabelText } = render(ActivityBar, { props: { collapsed: false, onToggleSidebar } });
    await fireEvent.click(getByLabelText('toggle sidebar'));
    expect(onToggleSidebar).toHaveBeenCalled();
  });

  it('clicking ⚙ calls onOpenSettings', async () => {
    const onOpenSettings = vi.fn();
    const { getByLabelText } = render(ActivityBar, { props: { collapsed: false, onOpenSettings } });
    await fireEvent.click(getByLabelText('settings'));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('navigator open (collapsed=false) → ☰ is active', () => {
    const { getByLabelText } = render(ActivityBar, { props: { collapsed: false } });
    const btn = getByLabelText('toggle sidebar');
    expect(btn.classList.contains('active')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('navigator hidden (collapsed=true) → ☰ is not active', () => {
    const { getByLabelText } = render(ActivityBar, { props: { collapsed: true } });
    const btn = getByLabelText('toggle sidebar');
    expect(btn.classList.contains('active')).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders a plugin button and sends onPluginButton(pluginId, opens)', async () => {
    const onPluginButton = vi.fn();
    const btns: ResolvedActivityButton[] = [{ pluginId: 'p', id: 'b', icon: '🎛', title: 'Demo', opens: 'p.panel' }];
    const { getByLabelText } = render(ActivityBar, { props: { pluginButtons: btns, onPluginButton } });
    await fireEvent.click(getByLabelText('Demo'));
    expect(onPluginButton).toHaveBeenCalledWith('p', 'p.panel');
  });

  it('the "extensions" button calls onOpenExtensions', async () => {
    const onOpenExtensions = vi.fn();
    const { getByLabelText } = render(ActivityBar, { props: { onOpenExtensions } });
    await fireEvent.click(getByLabelText('extensions'));
    expect(onOpenExtensions).toHaveBeenCalled();
  });

  it('the plugin button gets the .plugin class (for the smaller icon)', () => {
    const btns: ResolvedActivityButton[] = [{ pluginId: 'p', id: 'b', icon: '⎇', title: 'git', opens: 'p.panel' }];
    const { getByLabelText } = render(ActivityBar, { props: { pluginButtons: btns } });
    const btn = getByLabelText('git');
    expect(btn.classList.contains('plugin')).toBe(true);
    expect(btn.textContent).toBe('⎇');
  });
});

describe('ActivityBar plugin icon', () => {
  it('a button with iconPath renders an inline SVG instead of the text glyph', () => {
    const b: ResolvedActivityButton = { pluginId: 'p', id: 'b', icon: '◷', iconPath: 'M4 17A9 9 0 1 1 20 17Z', title: 'AI Limits', opens: 'panel' };
    const { getByLabelText } = render(ActivityBar, { props: { pluginButtons: [b], onPluginButton: () => {} } });
    const btn = getByLabelText('AI Limits');
    expect(btn.querySelector('svg path')?.getAttribute('d')).toBe('M4 17A9 9 0 1 1 20 17Z');
    expect(btn.textContent?.trim()).toBe('');
  });
});
