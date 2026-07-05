// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import FinderDropOverlay from './FinderDropOverlay.svelte';

afterEach(cleanup);

describe('FinderDropOverlay', () => {
  it('renders the hint when show=true', () => {
    const { getByText } = render(FinderDropOverlay, { props: { show: true } });
    expect(getByText(/will open in the editor/i)).toBeTruthy();
  });
  it('renders nothing when show=false', () => {
    const { queryByText } = render(FinderDropOverlay, { props: { show: false } });
    expect(queryByText(/will open in the editor/i)).toBeNull();
  });
  it('overlay does not capture pointer events (native drop must pass through)', () => {
    const { container } = render(FinderDropOverlay, { props: { show: true } });
    const el = container.querySelector('.finder-drop') as HTMLElement;
    expect(el).toBeTruthy();
    expect(getComputedStyle(el).pointerEvents).toBe('none');
  });
});
