// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import ColorRowWidget from './ColorRowWidget.svelte';

afterEach(cleanup);

describe('ColorRowWidget', () => {
  it('clicking a preset sends onCommand with the string "<command>:<#hex>"', async () => {
    const onCommand = vi.fn();
    const { container } = render(ColorRowWidget, { props: {
      w: { type: 'colorRow', label: 'L', value: '#b8bb26', command: 'usage.setSbColor:claude:5h' },
      onCommand,
    } });
    // first preset is orange (#fe8019) (COLOR_PRESETS, order: orange first)
    const sw = container.querySelector('.sw') as HTMLElement;
    await fireEvent.click(sw);
    expect(onCommand).toHaveBeenCalledWith('usage.setSbColor:claude:5h:#fe8019');
  });

  it('clicking without onCommand does not throw', async () => {
    const { container } = render(ColorRowWidget, { props: {
      w: { type: 'colorRow', label: 'L', value: '#b8bb26', command: 'c' },
    } });
    const sw = container.querySelector('.sw') as HTMLElement;
    await expect(fireEvent.click(sw)).resolves.not.toThrow();
  });

  it('value is passed to the native color-input', () => {
    const { container } = render(ColorRowWidget, { props: {
      w: { type: 'colorRow', label: 'L', value: '#b8bb26', command: 'c' },
      onCommand: () => {},
    } });
    const picker = container.querySelector('input[type="color"]') as HTMLInputElement;
    expect(picker.value).toBe('#b8bb26');
  });
});
