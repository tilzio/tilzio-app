// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import GridConsolesButton from './GridConsolesButton.svelte';

afterEach(cleanup);

describe('GridConsolesButton', () => {
  it('button opens and closes the popover', async () => {
    const { getByLabelText, queryByRole } = render(GridConsolesButton, { props: { onSubmit: vi.fn() } });
    expect(queryByRole('dialog')).toBeNull();
    await fireEvent.click(getByLabelText('grid consoles'));
    expect(queryByRole('dialog')).toBeTruthy();
  });
  it('clicking a picker cell calls onSubmit(c,r) and closes', async () => {
    const onSubmit = vi.fn();
    const { getByLabelText, queryByRole } = render(GridConsolesButton, { props: { onSubmit } });
    await fireEvent.click(getByLabelText('grid consoles'));
    await fireEvent.click(getByLabelText('3×2'));
    expect(onSubmit).toHaveBeenCalledWith(3, 2);
    expect(queryByRole('dialog')).toBeNull();
  });
  it('Esc closes without onSubmit', async () => {
    const onSubmit = vi.fn();
    const { getByLabelText, queryByRole } = render(GridConsolesButton, { props: { onSubmit } });
    await fireEvent.click(getByLabelText('grid consoles'));
    await fireEvent.keyDown(getByLabelText('columns'), { key: 'Escape' });
    expect(queryByRole('dialog')).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
