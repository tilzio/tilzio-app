// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import StatusBar from './StatusBar.svelte';
import type { ResolvedStatusItem } from '../state/pluginSlots';

afterEach(cleanup);

const sItem = (id: string, text: string, extra: Partial<ResolvedStatusItem> = {}): ResolvedStatusItem =>
  ({ pluginId: 'p', id, align: 'left', priority: 0, text, tone: 'default', ...extra });

describe('StatusBar', () => {
  it('shows the active path', () => {
    const { getByText } = render(StatusBar, { props: { activePath: 'space 1 › shell', consoleCount: 1 } });
    expect(getByText('space 1 › shell')).toBeTruthy();
  });

  it('shows the console count with pluralization', () => {
    const { getByText } = render(StatusBar, { props: { activePath: 'x', consoleCount: 3 } });
    expect(getByText('⌁ 3 consoles')).toBeTruthy();
  });

  it('clicking the toggle calls onToggleBottomPanel', async () => {
    const onToggleBottomPanel = vi.fn();
    const { getByLabelText } = render(StatusBar, {
      props: { activePath: 'x', consoleCount: 1, onToggleBottomPanel },
    });
    await fireEvent.click(getByLabelText('toggle bottom panel'));
    expect(onToggleBottomPanel).toHaveBeenCalled();
  });

  it('the toggle button is active (.open) when the panel is open', () => {
    const { getByLabelText } = render(StatusBar, {
      props: { activePath: 'x', consoleCount: 1, bottomPanelOpen: true },
    });
    const btn = getByLabelText('toggle bottom panel');
    expect(btn.classList.contains('open')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders plugin items on the left and right', () => {
    const { getByText } = render(StatusBar, { props: {
      activePath: 'x', consoleCount: 1,
      pluginLeft: [sItem('l', '🌿 main')],
      pluginRight: [sItem('r', '✓ ok', { align: 'right' })],
    } });
    expect(getByText('🌿 main')).toBeTruthy();
    expect(getByText('✓ ok')).toBeTruthy();
  });

  it('renders an inline SVG brand icon for an item with iconPath (tinted by iconColor)', () => {
    const { container, getByText } = render(StatusBar, { props: {
      activePath: 'x', consoleCount: 1,
      pluginLeft: [sItem('l', 'Claude', { iconPath: 'M12 2 L22 12 Z', iconColor: '#d97757' })],
    } });
    expect(getByText('Claude')).toBeTruthy();
    const path = container.querySelector('.pi svg path');
    expect(path?.getAttribute('d')).toBe('M12 2 L22 12 Z');
    const svg = container.querySelector('.pi svg') as SVGElement;
    expect(svg.style.color).toBe('rgb(217, 119, 87)');
  });

  it('clicking a plugin item with a command calls onPluginCommand', async () => {
    const onPluginCommand = vi.fn();
    const { getByText } = render(StatusBar, { props: {
      activePath: 'x', consoleCount: 1, onPluginCommand,
      pluginLeft: [sItem('l', 'click me', { command: 'do' })],
    } });
    await fireEvent.click(getByText('click me'));
    expect(onPluginCommand).toHaveBeenCalledWith('p', 'do');
  });
});

describe('StatusBar color override', () => {
  it('color overrides tone; without color — tone var', () => {
    const { container } = render(StatusBar, { props: {
      pluginLeft: [
        { pluginId: 'p', id: 'a', align: 'left', priority: 0, text: 'A', tone: 'accent', color: '#abcdef' },
        { pluginId: 'p', id: 'b', align: 'left', priority: 1, text: 'B', tone: 'warn' },
      ],
      onPluginCommand: vi.fn(),
    } });
    const html = container.innerHTML;
    // jsdom resolves #abcdef → rgb(171, 205, 239); check that the color is applied (not var(--accent))
    expect(html).toContain('rgb(171, 205, 239)'); // color:#abcdef applied
    expect(html).toContain('var(--amber)');        // tone:'warn' without color
  });
});

const item = (o: any) => ({ pluginId: 'p', id: o.id, align: 'left', priority: o.priority ?? 0, text: o.text, tone: 'default', ...o });
describe('StatusBar plugin chips', () => {
  it('fill item → .fill pill', () => {
    const { container } = render(StatusBar, { props: { pluginLeft: [item({ id: 'w', text: 'Watcher', color: '#fe8019', fill: true })] } });
    expect(container.querySelector('.pi.fill')).toBeTruthy();
  });
  it('same group wrapped in one .chip-group', () => {
    const { container } = render(StatusBar, { props: { pluginLeft: [item({ id: 'a', text: 'A', group: 'g' }), item({ id: 'b', text: 'B', group: 'g' }), item({ id: 'c', text: 'C' })] } });
    const groups = container.querySelectorAll('.chip-group');
    expect(groups.length).toBe(1);
    expect(groups[0].querySelectorAll('.pi').length).toBe(2);
  });
  it('alert item → .alert class', () => {
    const { container } = render(StatusBar, { props: { pluginLeft: [item({ id: 'a', text: 'A', alert: true })] } });
    expect(container.querySelector('.pi.alert')).toBeTruthy();
  });
});

describe('StatusBar S2.4 — LED path dot', () => {
  it('with a non-empty activePath renders .led before the path', () => {
    const { container } = render(StatusBar, { props: { activePath: 'api-gateway › server', consoleCount: 1 } });
    const led = container.querySelector('.led');
    expect(led).toBeTruthy();
    const path = container.querySelector('.path') as HTMLElement;
    // .led comes before .path in the DOM (compareDocumentPosition)
    expect(led!.compareDocumentPosition(path) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('with an empty activePath .led is absent', () => {
    const { container } = render(StatusBar, { props: { activePath: '', consoleCount: 0 } });
    expect(container.querySelector('.led')).toBeNull();
  });
});
