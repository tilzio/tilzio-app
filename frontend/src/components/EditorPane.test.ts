// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
vi.mock('./EditorFileBody.svelte');
import EditorPane from './EditorPane.svelte';
import { editorDirty, __resetForTests as __resetDirty } from '../bridge/editorDirty.svelte';

afterEach(cleanup);
beforeEach(() => __resetDirty());
const file = (id: string, path: string) => ({ fileId: id, path, mode: 'source' as const });
const base = (over = {}) => ({ paneId: 'p1', files: [], activeFileId: undefined,
  onFocus: vi.fn(), onSplit: vi.fn(), onSplitAs: vi.fn(), onClose: vi.fn(), onZoom: vi.fn(),
  onOpenFile: vi.fn(), onMakeTerminal: vi.fn(), onActivateFile: vi.fn(), onCloseFile: vi.fn(), onModeChange: vi.fn(), ...over });

it('renders welcome cards when files are empty', () => {
  const { getByText } = render(EditorPane, { props: base() });
  expect(getByText('Terminal')).toBeTruthy();
  expect(getByText('Open file')).toBeTruthy();
});
it('welcome «Terminal» fires onMakeTerminal; «Open file» fires onOpenFile', async () => {
  const onMakeTerminal = vi.fn(), onOpenFile = vi.fn();
  const { getByText } = render(EditorPane, { props: base({ onMakeTerminal, onOpenFile }) });
  await fireEvent.click(getByText('Terminal')); expect(onMakeTerminal).toHaveBeenCalled();
  await fireEvent.click(getByText('Open file')); expect(onOpenFile).toHaveBeenCalled();
});
it('renders the active file body when files present', async () => {
  const f = file('f1', '/a.ts');
  const { container } = render(EditorPane, { props: base({ files: [f], activeFileId: 'f1' }) });
  await waitFor(() => expect(container.querySelector('[data-file-body="f1"]')).toBeTruthy());
});
it('forwards onFocus on pointerdown', async () => {
  const onFocus = vi.fn();
  const { container } = render(EditorPane, { props: base({ onFocus }) });
  await fireEvent.pointerDown(container.querySelector('.pane')!);
  expect(onFocus).toHaveBeenCalled();
});
it('lights the chip ● live when editorDirty flips (de-risk §1 reactivity)', async () => {
  const f = file('f1', '/a.ts');
  const { container } = render(EditorPane, { props: base({ files: [f], activeFileId: 'f1' }) });
  expect(container.querySelector('.ftab .dot')).toBeFalsy();   // clean
  editorDirty.set('f1', true);
  await waitFor(() => expect(container.querySelector('.ftab .dot')).toBeTruthy()); // ● lit up reactively
});

// FIX: the welcome card stole focus on every remount even for inactive panes,
// and a stray ⏎ then converted the wrong pane to a terminal.
it('welcome card does NOT autofocus when the pane is inactive', () => {
  const { getByText } = render(EditorPane, { props: base({ active: false }) });
  const btn = getByText('Terminal').closest('button');
  expect(document.activeElement).not.toBe(btn);
});

it('welcome card autofocuses the Terminal button when the pane is active', () => {
  const { getByText } = render(EditorPane, { props: base({ active: true }) });
  const btn = getByText('Terminal').closest('button');
  expect(document.activeElement).toBe(btn);
});
