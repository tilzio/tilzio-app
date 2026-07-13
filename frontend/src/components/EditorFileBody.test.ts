// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
const handle = vi.hoisted(() => ({
  getDoc: vi.fn(() => 'file body'),
  getCursor: vi.fn(() => 0),
  focus: vi.fn(),
  gotoLine: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock('../bridge/editorSetup', () => ({ mountEditor: vi.fn(() => handle) }));
vi.mock('../bridge/files', () => ({
  files: {
    readFile: vi.fn(async () => 'file body'),
    saveDraft: vi.fn(async () => undefined),
    clearDraft: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
  },
}));
vi.mock('@wailsio/runtime', () => ({ Browser: { OpenURL: vi.fn(async () => undefined) } }));
import EditorFileBody from './EditorFileBody.svelte';
import { Browser } from '@wailsio/runtime';
import { mountEditor } from '../bridge/editorSetup';
import { files } from '../bridge/files';
import { editorBuffers, __resetForTests } from '../bridge/editorBuffers.svelte';
import { editorDirty, __resetForTests as __resetDirty } from '../bridge/editorDirty.svelte';
import { pendingGoto, __resetForTests as __resetGoto } from '../bridge/pendingGoto.svelte';

beforeEach(() => {
  __resetForTests();
  __resetDirty();
  __resetGoto();
  vi.clearAllMocks();
  handle.getDoc.mockReturnValue('file body');
  handle.getCursor.mockReturnValue(0);
});
afterEach(cleanup);

const props = (over: Record<string, unknown> = {}) => ({
  fileId: 'f1',
  path: '/proj/files.ts',
  mode: 'source' as const,
  active: false,
  ...over,
});

it('reads the file and mounts CM6 on first mount', async () => {
  render(EditorFileBody, { props: props() });
  await waitFor(() => expect(files.readFile).toHaveBeenCalledWith('/proj/files.ts'));
  await waitFor(() => expect(mountEditor).toHaveBeenCalled());
});

it('reuses the stored buffer by fileId (§9-analog)', async () => {
  editorBuffers.set('f1', {
    path: '/proj/files.ts',
    doc: 'cached',
    dirty: true,
    cursor: 2,
    mode: 'source',
  });
  render(EditorFileBody, { props: props() });
  await waitFor(() =>
    expect(mountEditor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ doc: 'cached', cursor: 2 }),
    ),
  );
  expect(files.readFile).not.toHaveBeenCalled();
});

it('writes the buffer to the store on unmount by fileId, without deletion', async () => {
  handle.getDoc.mockReturnValue('edited');
  handle.getCursor.mockReturnValue(5);
  const { unmount } = render(EditorFileBody, { props: props() });
  await waitFor(() => expect(mountEditor).toHaveBeenCalled());
  unmount();
  expect(editorBuffers.get('f1')?.doc).toBe('edited');
  expect(editorBuffers.has('f1')).toBe(true);
});

it('preview renders sanitized HTML, without CM6', async () => {
  (files.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
    '# Hello\n\n<script>x=1<\/script>',
  );
  const { container } = render(EditorFileBody, {
    props: props({ path: '/r.md', mode: 'preview' }),
  });
  await waitFor(() =>
    expect(container.querySelector('.preview')?.innerHTML).toContain('<h1'),
  );
  expect(container.querySelector('.preview')?.innerHTML).not.toContain('<script');
  expect(mountEditor).not.toHaveBeenCalled();
});

it('split mounts CM6 AND renders preview', async () => {
  (files.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce('# Doc');
  const { container } = render(EditorFileBody, {
    props: props({ path: '/r.md', mode: 'split' }),
  });
  await waitFor(() => expect(mountEditor).toHaveBeenCalled());
  await waitFor(() =>
    expect(container.querySelector('.prevpane')?.innerHTML).toContain('<h1'),
  );
});

// helper: get the onChange passed to mountEditor on the last mount
const lastOnChange = () =>
  (mountEditor as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1].onChange as (s: string) => void;

it('lights the reactive dirty flag and keeps the buffer doc fresh on edit', async () => {
  render(EditorFileBody, { props: props() });
  await waitFor(() => expect(mountEditor).toHaveBeenCalled());
  lastOnChange()('edited text');
  expect(editorDirty.get('f1')).toBe(true);
  expect(editorBuffers.get('f1')?.doc).toBe('edited text');
});

it('restores dirty ● from a cached buffer on mount', async () => {
  editorBuffers.set('f1', { path: '/proj/files.ts', doc: 'draft', dirty: true, cursor: 0, mode: 'source' });
  render(EditorFileBody, { props: props() });
  await waitFor(() => expect(mountEditor).toHaveBeenCalled());
  expect(editorDirty.get('f1')).toBe(true);
});

it('flushes a pending draft on unmount (saveDraft by fileId)', async () => {
  const { unmount } = render(EditorFileBody, { props: props() });
  await waitFor(() => expect(mountEditor).toHaveBeenCalled());
  lastOnChange()('edited');           // schedules the draft debounce (pending)
  unmount();                          // onDestroy → draftDebounced.flush() → saveDraft
  expect(files.saveDraft).toHaveBeenCalledWith('f1', '/proj/files.ts', 'edited');
});

it('does not resurrect a draft after it was saved (dirty cleared)', async () => {
  const { unmount } = render(EditorFileBody, { props: props() });
  await waitFor(() => expect(mountEditor).toHaveBeenCalled());
  lastOnChange()('edited');
  editorDirty.set('f1', false);       // ⌘S happened elsewhere → flag cleared
  unmount();                          // flush → guard sees not-dirty → skip
  expect(files.saveDraft).not.toHaveBeenCalled();
});

it('persists dirty=false to the buffer on unmount after editorDirty was cleared (post-⌘S)', async () => {
  const { unmount } = render(EditorFileBody, { props: props() });
  await waitFor(() => expect(mountEditor).toHaveBeenCalled());
  lastOnChange()('edited');            // editorDirty f1 = true, buffer dirty = true
  editorDirty.set('f1', false);        // simulate ⌘S clearing dirty elsewhere
  unmount();                            // onDestroy must write buffer.dirty from editorDirty (false), not stale local state
  expect(editorBuffers.get('f1')?.dirty).toBe(false);
});

it('does not populate the buffer on a fresh disk-read mount (buffer stays empty until first edit)', async () => {
  render(EditorFileBody, { props: props() });
  await waitFor(() => expect(mountEditor).toHaveBeenCalled());
  expect(editorBuffers.has('f1')).toBe(false);   // ⌘S must therefore guard against a missing buffer (App)
});

it('jumps to a pending goto target on mount and consumes it (exactly once)', async () => {
  pendingGoto.set('f1', { line: 12, col: 3 });
  render(EditorFileBody, { props: props({ fileId: 'f1' }) });
  await waitFor(() => expect(handle.gotoLine).toHaveBeenCalledWith(12, 3));
  expect(pendingGoto.get('f1')).toBeUndefined();   // consumed
  expect(handle.gotoLine).toHaveBeenCalledTimes(1); // action applied it, $effect — no-op after consume
});

it('discards a pending goto target when the file fails to load (no leak)', async () => {
  (files.readFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('binary'));
  pendingGoto.set('f1', { line: 5 });
  render(EditorFileBody, { props: props({ fileId: 'f1' }) });
  await waitFor(() => expect(pendingGoto.get('f1')).toBeUndefined()); // consumed, doesn't hang
  expect(handle.gotoLine).not.toHaveBeenCalled(); // CM6 not mounted — no jump
});

describe('preview link clicks (FIX: navigation escaped the WKWebView)', () => {
  it('http(s) link in preview → preventDefault + Browser.OpenURL', async () => {
    (files.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce('[site](https://example.com/x)');
    const { container } = render(EditorFileBody, { props: props({ path: '/r.md', mode: 'preview' }) });
    await waitFor(() => expect(container.querySelector('.preview a')).toBeTruthy());
    const notCancelled = await fireEvent.click(container.querySelector('.preview a')!);
    expect(notCancelled).toBe(false); // preventDefault was called — no webview navigation
    expect(Browser.OpenURL).toHaveBeenCalledWith('https://example.com/x');
  });

  it('mailto link in preview → preventDefault + Browser.OpenURL', async () => {
    (files.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce('[mail](mailto:a@b.c)');
    const { container } = render(EditorFileBody, { props: props({ path: '/r.md', mode: 'preview' }) });
    await waitFor(() => expect(container.querySelector('.preview a')).toBeTruthy());
    const notCancelled = await fireEvent.click(container.querySelector('.preview a')!);
    expect(notCancelled).toBe(false);
    expect(Browser.OpenURL).toHaveBeenCalledWith('mailto:a@b.c');
  });

  it('relative / anchor links are neutralized (preventDefault, no OpenURL)', async () => {
    (files.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce('[rel](./other.md) [anchor](#sec)');
    const { container } = render(EditorFileBody, { props: props({ path: '/r.md', mode: 'preview' }) });
    await waitFor(() => expect(container.querySelectorAll('.preview a').length).toBe(2));
    for (const a of Array.from(container.querySelectorAll('.preview a'))) {
      const notCancelled = await fireEvent.click(a);
      expect(notCancelled).toBe(false);
    }
    expect(Browser.OpenURL).not.toHaveBeenCalled();
  });

  it('split-mode prevpane links are intercepted too', async () => {
    (files.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce('[site](https://example.com/y)');
    const { container } = render(EditorFileBody, { props: props({ path: '/r.md', mode: 'split' }) });
    await waitFor(() => expect(container.querySelector('.prevpane a')).toBeTruthy());
    const notCancelled = await fireEvent.click(container.querySelector('.prevpane a')!);
    expect(notCancelled).toBe(false);
    expect(Browser.OpenURL).toHaveBeenCalledWith('https://example.com/y');
  });

  it('a click on non-link preview content is left alone', async () => {
    (files.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce('# Title');
    const { container } = render(EditorFileBody, { props: props({ path: '/r.md', mode: 'preview' }) });
    await waitFor(() => expect(container.querySelector('.preview h1')).toBeTruthy());
    const notCancelled = await fireEvent.click(container.querySelector('.preview h1')!);
    expect(notCancelled).toBe(true); // not prevented
    expect(Browser.OpenURL).not.toHaveBeenCalled();
  });
});

describe('draft flush on app quit (FIX: debounce tail lost)', () => {
  it('flushes the pending draft on window pagehide', async () => {
    render(EditorFileBody, { props: props() });
    await waitFor(() => expect(mountEditor).toHaveBeenCalled());
    lastOnChange()('edited tail');       // schedules the 400ms draft debounce
    window.dispatchEvent(new Event('pagehide'));
    expect(files.saveDraft).toHaveBeenCalledWith('f1', '/proj/files.ts', 'edited tail');
  });

  it('unregisters its flush on unmount (no stale flush for a dead component)', async () => {
    const { unmount } = render(EditorFileBody, { props: props() });
    await waitFor(() => expect(mountEditor).toHaveBeenCalled());
    unmount();
    (files.saveDraft as ReturnType<typeof vi.fn>).mockClear();
    window.dispatchEvent(new Event('pagehide'));
    expect(files.saveDraft).not.toHaveBeenCalled();
  });
});

describe('purge tombstone (FIX: onDestroy resurrected purged buffers)', () => {
  it('purge then destroy → buffer map stays empty', async () => {
    const { unmount } = render(EditorFileBody, { props: props() });
    await waitFor(() => expect(mountEditor).toHaveBeenCalled());
    lastOnChange()('edited');            // buffer now populated
    // Permanent close: App.purgeEditorFiles deletes buffer + dirty and tombstones the id.
    editorBuffers.purge('f1');
    editorDirty.delete('f1');
    unmount();                           // onDestroy must NOT re-write the buffer
    expect(editorBuffers.has('f1')).toBe(false);
  });

  it('a plain unmount (no purge) still persists the buffer (§9 intact)', async () => {
    handle.getDoc.mockReturnValue('kept');
    const { unmount } = render(EditorFileBody, { props: props() });
    await waitFor(() => expect(mountEditor).toHaveBeenCalled());
    lastOnChange()('kept');
    unmount();
    expect(editorBuffers.get('f1')?.doc).toBe('kept');
  });
});
