// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import SegmentedWidget from './SegmentedWidget.svelte';
afterEach(cleanup);
describe('SegmentedWidget', () => {
  it('renders options, active = value, click emits command:value', async () => {
    const onCommand = vi.fn();
    const { getByText } = render(SegmentedWidget, { props: { w: { type: 'segmented', label: 'View', value: 'meter', command: 'p.viz', options: [{ value: 'meter', label: 'Meter' }, { value: 'rings', label: 'Rings' }] }, onCommand } });
    expect(getByText('Meter').getAttribute('aria-pressed')).toBe('true');
    expect(getByText('Rings').getAttribute('aria-pressed')).toBe('false');
    await fireEvent.click(getByText('Rings'));
    expect(onCommand).toHaveBeenCalledWith('p.viz:rings');
  });
});
