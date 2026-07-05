// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import PerimeterDrop from './PerimeterDrop.svelte';
import { dragState, endDrag } from '../bridge/dragState.svelte';

beforeEach(() => endDrag());
afterEach(() => { cleanup(); endDrag(); });

describe('PerimeterDrop', () => {
  it('does not render strips without an active drag', () => {
    const { container } = render(PerimeterDrop, { props: { onMovePane: vi.fn() } });
    expect(container.querySelectorAll('.edge-strip').length).toBe(0);
  });

  it('draws 4 strips during a drag', () => {
    dragState.dragId = 'x';
    const { container } = render(PerimeterDrop, { props: { onMovePane: vi.fn() } });
    expect(container.querySelectorAll('.edge-strip').length).toBe(4);
  });

  it('drop on the left strip → outer left, clears the drag', async () => {
    dragState.dragId = 'x';
    const onMovePane = vi.fn();
    const { container } = render(PerimeterDrop, { props: { onMovePane } });
    await fireEvent.drop(container.querySelector('.edge-strip.left')!);
    expect(onMovePane).toHaveBeenCalledWith('x', { kind: 'outer', side: 'left' });
    expect(dragState.dragId).toBeNull(); // endDrag called
  });

  it('drop without an active drag is ignored', async () => {
    const onMovePane = vi.fn();
    // dragId null, but there are no strips — check that even a forced drop by selector doesn't crash.
    dragState.dragId = 'y';
    const { container } = render(PerimeterDrop, { props: { onMovePane } });
    endDrag(); // clear the drag after the strips have rendered
    await fireEvent.drop(container.querySelector('.edge-strip.right')!);
    expect(onMovePane).not.toHaveBeenCalled();
  });

  it('strip highlight by candidate', () => {
    dragState.dragId = 'x';
    dragState.candidate = { kind: 'outer', side: 'right' };
    const { container } = render(PerimeterDrop, { props: { onMovePane: vi.fn() } });
    expect(container.querySelector('.edge-strip.right.draghint')).toBeTruthy();
  });
});
