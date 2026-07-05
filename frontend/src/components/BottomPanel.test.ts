// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import BottomPanel from './BottomPanel.svelte';
import { STATUS_BAR_HEIGHT } from '../state/bottomPanel';
import type { ResolvedPanel } from '../state/pluginSlots';

afterEach(cleanup);

describe('BottomPanel', () => {
  it('renders a placeholder', () => {
    const { getByText } = render(BottomPanel, { props: { height: 200, onResize: vi.fn(), onReset: vi.fn() } });
    expect(getByText('no active panels')).toBeTruthy();
  });

  it('dragging the top handle emits onResize with height from the window bottom', async () => {
    const onResize = vi.fn();
    const { container } = render(BottomPanel, { props: { height: 200, onResize, onReset: vi.fn() } });
    const handle = container.querySelector('.resize-handle') as HTMLElement;
    await fireEvent.pointerDown(handle, { clientY: 500, pointerId: 1 });
    await fireEvent.pointerMove(handle, { clientY: 400, pointerId: 1 });
    expect(onResize).toHaveBeenCalledWith(window.innerHeight - STATUS_BAR_HEIGHT - 400);
  });

  it('move without pointerdown does not emit', async () => {
    const onResize = vi.fn();
    const { container } = render(BottomPanel, { props: { height: 200, onResize, onReset: vi.fn() } });
    const handle = container.querySelector('.resize-handle') as HTMLElement;
    await fireEvent.pointerMove(handle, { clientY: 400, pointerId: 1 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it('dblclick on the handle calls onReset', async () => {
    const onReset = vi.fn();
    const { container } = render(BottomPanel, { props: { height: 200, onResize: vi.fn(), onReset } });
    const handle = container.querySelector('.resize-handle') as HTMLElement;
    await fireEvent.dblClick(handle);
    expect(onReset).toHaveBeenCalled();
  });

  it('renders the active panel widgets', () => {
    const panels: ResolvedPanel[] = [{ pluginId: 'p', id: 'a', title: 'A', location: 'bottom', widgets: [{ type: 'text', text: 'hello', tone: 'default' }] }];
    const { getByText } = render(BottomPanel, { props: { height: 200, onResize: vi.fn(), onReset: vi.fn(), panels, activeId: 'a' } });
    expect(getByText('hello')).toBeTruthy();
  });

  it('the resize handle has role=separator + aria-label', () => {
    const { container } = render(BottomPanel, { props: { height: 200 } });
    const h = container.querySelector('.resize-handle')!;
    expect(h.getAttribute('role')).toBe('separator');
    expect(h.getAttribute('aria-label')).toBe('resize bottom panel');
  });

  it('after pointercancel the drag is reset — move does not emit', async () => {
    const onResize = vi.fn();
    const { container } = render(BottomPanel, { props: { height: 200, onResize, onReset: vi.fn() } });
    const handle = container.querySelector('.resize-handle') as HTMLElement;
    await fireEvent.pointerDown(handle, { clientY: 500, pointerId: 1 });
    await fireEvent.pointerCancel(handle, { clientY: 480, pointerId: 1 });
    onResize.mockClear();
    await fireEvent.pointerMove(handle, { clientY: 300, pointerId: 1 });
    expect(onResize).not.toHaveBeenCalled();
  });
});
