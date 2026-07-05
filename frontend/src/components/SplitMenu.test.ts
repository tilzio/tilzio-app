// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import SplitMenu from './SplitMenu.svelte';
afterEach(cleanup);

it('calls onTerminal / onEditor / onOpenFile and closes', async () => {
  const onTerminal = vi.fn(), onEditor = vi.fn(), onOpenFile = vi.fn(), onClose = vi.fn();
  const { getByText } = render(SplitMenu, { props: { onTerminal, onEditor, onOpenFile, onClose } });
  await fireEvent.click(getByText('Terminal'));
  expect(onTerminal).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});
it('Escape closes the menu', async () => {
  const onClose = vi.fn();
  const { container } = render(SplitMenu, { props: { onTerminal: vi.fn(), onEditor: vi.fn(), onOpenFile: vi.fn(), onClose } });
  await fireEvent.keyDown(container.querySelector('[role="menu"]')!, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});
