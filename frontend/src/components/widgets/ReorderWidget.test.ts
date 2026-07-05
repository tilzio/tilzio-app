// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import ReorderWidget from './ReorderWidget.svelte';
import { endWidgetDrag } from '../../bridge/widgetDragState.svelte';
import type { ReorderWidget as RW } from '../../state/widgets';

afterEach(() => { cleanup(); endWidgetDrag(); });

const w: RW = { type: 'reorder', command: 'cmd', items: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }] };

describe('ReorderWidget', () => {
  it('renders all items + handles', () => {
    const { getByText, container } = render(ReorderWidget, { props: { w } });
    expect(getByText('A')).toBeTruthy();
    expect(container.querySelectorAll('.item').length).toBe(3);
    expect(container.querySelectorAll('.grip').length).toBe(3); // canDrag (>1)
  });

  it('dropping an item sends onCommand with the new order (jsdom geometry → after)', async () => {
    const onCommand = vi.fn();
    const { getByText } = render(ReorderWidget, { props: { w, onCommand } });
    const itemA = getByText('A').closest('.item')!;
    const itemC = getByText('C').closest('.item')!;
    await fireEvent.dragStart(itemA);
    await fireEvent.drop(itemC);
    expect(onCommand).toHaveBeenCalledWith('cmd:b,c,a');
  });

  it('single item → drag disabled (no handles)', () => {
    const { container } = render(ReorderWidget, { props: { w: { type: 'reorder', command: 'cmd', items: [{ id: 'a', text: 'A' }] } } });
    expect(container.querySelectorAll('.grip').length).toBe(0);
  });

  it('card variant: no grip, but the card is draggable (dragged as a whole)', () => {
    const cardW: RW = { type: 'reorder', command: 'cmd', card: true, items: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] };
    const { container } = render(ReorderWidget, { props: { w: cardW } });
    expect(container.querySelectorAll('.grip').length).toBe(0);
    expect(container.querySelector('.item')!.getAttribute('draggable')).toBe('true');
  });

  it('alert item gets .alert class on its card', () => {
    const { container } = render(ReorderWidget, { props: { w: { type: 'reorder', card: true, command: 'p.ord', items: [{ id: 'a', alert: true, widgets: [{ type: 'text', text: 'x' }] }, { id: 'b', widgets: [{ type: 'text', text: 'y' }] }] } } });
    const items = container.querySelectorAll('.item');
    expect(items[0].classList.contains('alert')).toBe(true);
    expect(items[1].classList.contains('alert')).toBe(false);
  });
});
