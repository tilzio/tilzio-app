// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import RightAreaResizer from './RightAreaResizer.svelte';

afterEach(cleanup);

describe('RightAreaResizer', () => {
  it('drag emits onResize with width = innerWidth − clientX', async () => {
    const onResize = vi.fn();
    const { container } = render(RightAreaResizer, { props: { onResize, onReset: vi.fn() } });
    const r = container.querySelector('.resizer') as HTMLElement;
    await fireEvent.pointerDown(r, { clientX: 1000, pointerId: 1 });
    await fireEvent.pointerMove(r, { clientX: 800, pointerId: 1 });
    expect(onResize).toHaveBeenCalledWith(window.innerWidth - 800);
  });

  it('move without pointerdown does not emit', async () => {
    const onResize = vi.fn();
    const { container } = render(RightAreaResizer, { props: { onResize, onReset: vi.fn() } });
    const r = container.querySelector('.resizer') as HTMLElement;
    await fireEvent.pointerMove(r, { clientX: 800, pointerId: 1 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it('dblclick calls onReset', async () => {
    const onReset = vi.fn();
    const { container } = render(RightAreaResizer, { props: { onResize: vi.fn(), onReset } });
    await fireEvent.dblClick(container.querySelector('.resizer') as HTMLElement);
    expect(onReset).toHaveBeenCalled();
  });
});
