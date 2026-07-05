// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import ToggleWidget from './ToggleWidget.svelte';
afterEach(cleanup);
describe('ToggleWidget', () => {
  it('on → click emits command:0; aria-checked true', async () => {
    const onCommand = vi.fn();
    const { getByRole } = render(ToggleWidget, { props: { w: { type: 'toggle', label: 'Fill', value: true, command: 'p.fill' }, onCommand } });
    const sw = getByRole('switch');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    await fireEvent.click(sw);
    expect(onCommand).toHaveBeenCalledWith('p.fill:0');
  });
  it('off → click emits command:1', async () => {
    const onCommand = vi.fn();
    const { getByRole } = render(ToggleWidget, { props: { w: { type: 'toggle', value: false, command: 'p.x' }, onCommand } });
    await fireEvent.click(getByRole('switch'));
    expect(onCommand).toHaveBeenCalledWith('p.x:1');
  });
});
