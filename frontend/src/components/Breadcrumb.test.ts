// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import Breadcrumb from './Breadcrumb.svelte';
import type { ResolvedBreadcrumbItem } from '../state/pluginSlots';

afterEach(cleanup);

describe('Breadcrumb', () => {
  it('renders the parts', () => {
    const { getByText } = render(Breadcrumb, { props: { parts: ['space 1', 'tab 1'] } });
    expect(getByText('space 1')).toBeTruthy();
    expect(getByText('tab 1')).toBeTruthy();
  });

  it('add-tab button fires onAddTab', async () => {
    const onAddTab = vi.fn();
    const { getByLabelText } = render(Breadcrumb, { props: { parts: ['space 1'], onAddTab } });
    await fireEvent.click(getByLabelText('add tab'));
    expect(onAddTab).toHaveBeenCalled();
  });

  it('grid: submit forwards to onAddConsoles', async () => {
    const onAddConsoles = vi.fn();
    const { getByLabelText } = render(Breadcrumb, { props: { parts: ['s'], onAddConsoles } });
    await fireEvent.click(getByLabelText('grid consoles'));
    await fireEvent.click(getByLabelText('2×2'));
    expect(onAddConsoles).toHaveBeenCalledWith(2, 2);
  });

  it('renders a plugin item in the breadcrumb', () => {
    const items: ResolvedBreadcrumbItem[] = [{ pluginId: 'p', id: 'c', text: 'main', icon: '🌿', tone: 'accent' }];
    const { getByText } = render(Breadcrumb, { props: { parts: ['work'], pluginItems: items } });
    expect(getByText('🌿 main')).toBeTruthy();
  });

  it('clicking the toggle button ③ calls onToggleRightArea', async () => {
    const onToggleRightArea = vi.fn();
    const { getByLabelText } = render(Breadcrumb, { props: { parts: ['x'], onToggleRightArea } });
    await fireEvent.click(getByLabelText('toggle right panel'));
    expect(onToggleRightArea).toHaveBeenCalled();
  });

  it('the last path segment gets the .active class, the first does not', () => {
    const { container } = render(Breadcrumb, { props: { parts: ['api-gateway', 'server'] } });
    const ps = container.querySelectorAll('.part');
    expect(ps.length).toBe(2);
    expect(ps[0].classList.contains('active')).toBe(false);
    expect(ps[1].classList.contains('active')).toBe(true);
    expect(ps[1].textContent).toBe('server');
  });

  it('a single segment is active', () => {
    const { container } = render(Breadcrumb, { props: { parts: ['only'] } });
    const ps = container.querySelectorAll('.part');
    expect(ps.length).toBe(1);
    expect(ps[0].classList.contains('active')).toBe(true);
  });

  it('color overrides tone; without color, tone-var', () => {
    const items: ResolvedBreadcrumbItem[] = [
      { pluginId: 'p', id: 'a', text: 'A', tone: 'accent', color: '#abcdef' },
      { pluginId: 'p', id: 'b', text: 'B', tone: 'warn' },
    ];
    const { container } = render(Breadcrumb, { props: { parts: ['work'], pluginItems: items } });
    const html = container.innerHTML;
    // jsdom resolves #abcdef → rgb(171, 205, 239); we check that color is applied (not var(--accent))
    expect(html).toContain('rgb(171, 205, 239)'); // color:#abcdef applied
    expect(html).toContain('var(--amber)');        // tone:'warn' without color
  });
});
