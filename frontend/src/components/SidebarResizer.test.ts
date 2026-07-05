// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import SidebarResizer from './SidebarResizer.svelte';

afterEach(cleanup);

describe('SidebarResizer', () => {
  it('dblclick calls onReset', async () => {
    const onReset = vi.fn();
    const onResize = vi.fn();
    const { container } = render(SidebarResizer, { props: { onResize, onReset } });
    const handle = container.querySelector('.resizer') as HTMLElement;
    await fireEvent.dblClick(handle);
    expect(onReset).toHaveBeenCalled();
  });

  it('drag emits onResize with clientX', async () => {
    const onReset = vi.fn();
    const onResize = vi.fn();
    const { container } = render(SidebarResizer, { props: { onResize, onReset } });
    const handle = container.querySelector('.resizer') as HTMLElement;
    await fireEvent.pointerDown(handle, { clientX: 200, pointerId: 1 });
    await fireEvent.pointerMove(handle, { clientX: 260, pointerId: 1 });
    expect(onResize).toHaveBeenCalledWith(260);
  });

  it('move without a preceding pointerdown does not emit', async () => {
    const onReset = vi.fn();
    const onResize = vi.fn();
    const { container } = render(SidebarResizer, { props: { onResize, onReset } });
    const handle = container.querySelector('.resizer') as HTMLElement;
    await fireEvent.pointerMove(handle, { clientX: 260, pointerId: 1 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it('offset is subtracted from clientX (bar offset)', async () => {
    const onReset = vi.fn();
    const onResize = vi.fn();
    const { container } = render(SidebarResizer, { props: { onResize, onReset, offset: 44 } });
    const handle = container.querySelector('.resizer') as HTMLElement;
    await fireEvent.pointerDown(handle, { clientX: 200, pointerId: 1 });
    await fireEvent.pointerMove(handle, { clientX: 264, pointerId: 1 });
    expect(onResize).toHaveBeenCalledWith(220);
  });

  it('after pointercancel the drag is reset — move no longer emits (no phantom resize)', async () => {
    const onReset = vi.fn();
    const onResize = vi.fn();
    const { container } = render(SidebarResizer, { props: { onResize, onReset } });
    const handle = container.querySelector('.resizer') as HTMLElement;
    await fireEvent.pointerDown(handle, { clientX: 200, pointerId: 1 });
    await fireEvent.pointerCancel(handle, { clientX: 220, pointerId: 1 });
    onResize.mockClear();
    await fireEvent.pointerMove(handle, { clientX: 300, pointerId: 1 });
    expect(onResize).not.toHaveBeenCalled();
  });
});
