// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import PaneHeader from './PaneHeader.svelte';
import { beginDrag, endDrag } from '../bridge/dragState.svelte';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read the component source — jsdom doesn't resolve Svelte scoped styles in computed-style
function readPaneHeaderSource(): string {
  return readFileSync(resolve(__dirname, 'PaneHeader.svelte'), 'utf-8');
}
vi.mock('../bridge/dragState.svelte', () => ({
  beginDrag: vi.fn(),
  endDrag: vi.fn(),
  setCandidate: vi.fn(),
  dragState: { dragId: null, candidate: null },
}));

afterEach(cleanup);

describe('PaneHeader', () => {
  it('shows the title when set', () => {
    const { getByText } = render(PaneHeader, { props: { paneId: 'p1', title: 'build', cwd: '/x' } });
    expect(getByText('build', { exact: false })).toBeTruthy();
  });

  it('falls back to cwd when no title', () => {
    const { getByText } = render(PaneHeader, { props: { paneId: 'p1', cwd: '~/proj' } });
    expect(getByText('~/proj', { exact: false })).toBeTruthy();
  });

  it('fires split/zoom/close callbacks', async () => {
    const onSplit = vi.fn(), onZoom = vi.fn(), onClose = vi.fn();
    const { getByLabelText } = render(PaneHeader, { props: { paneId: 'p1', cwd: '', onSplit, onZoom, onClose } });
    await fireEvent.click(getByLabelText('split right'));
    await fireEvent.click(getByLabelText('split down'));
    await fireEvent.click(getByLabelText('zoom'));
    await fireEvent.click(getByLabelText('close pane'));
    expect(onSplit).toHaveBeenNthCalledWith(1, 'v');
    expect(onSplit).toHaveBeenNthCalledWith(2, 'h');
    expect(onZoom).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('double-click name → edit → Enter commits onRename', async () => {
    const onRename = vi.fn();
    const { getByText, getByDisplayValue } = render(PaneHeader, { props: { paneId: 'p1', title: 'old', cwd: '', onRename } });
    await fireEvent.dblClick(getByText('old', { exact: false }));
    const input = getByDisplayValue('old') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'new' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('new');
  });

  it('Escape cancels rename', async () => {
    const onRename = vi.fn();
    const { getByText, getByDisplayValue, queryByDisplayValue } =
      render(PaneHeader, { props: { paneId: 'p1', title: 'old', cwd: '', onRename } });
    await fireEvent.dblClick(getByText('old', { exact: false }));
    await fireEvent.keyDown(getByDisplayValue('old'), { key: 'Escape' });
    expect(onRename).not.toHaveBeenCalled();
    expect(queryByDisplayValue('old')).toBeNull();
  });

  it('Enter then blur commits only once', async () => {
    const onRename = vi.fn();
    const { getByText, getByDisplayValue } =
      render(PaneHeader, { props: { paneId: 'p1', title: 'old', cwd: '', onRename } });
    await fireEvent.dblClick(getByText('old', { exact: false }));
    const input = getByDisplayValue('old') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'new' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    await fireEvent.blur(input);
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it('shows a dirty ● when dirty=true', () => {
    const { container } = render(PaneHeader, { props: { paneId: 'p1', title: 'files.ts', dirty: true } });
    expect(container.querySelector('.dot')).toBeTruthy();
  });

  it('no ● when dirty is unset (terminal case)', () => {
    const { container } = render(PaneHeader, { props: { paneId: 'p1', cwd: '/x' } });
    expect(container.querySelector('.dot')).toBeNull();
  });

  it('double-click does NOT enter edit mode without onRename (editor case)', async () => {
    const { getByText, container } = render(PaneHeader, { props: { paneId: 'p1', title: 'files.ts' } });
    await fireEvent.dblClick(getByText('files.ts', { exact: false }));
    expect(container.querySelector('input.rename')).toBeNull();
  });
});

describe('PaneHeader — draggable handle', () => {
  beforeEach(() => vi.clearAllMocks());
  it('the header is draggable, dragstart calls beginDrag(paneId)', async () => {
    const { container } = render(PaneHeader, { props: { paneId: 'p7', cwd: '~/x' } });
    const header = container.querySelector('.header') as HTMLElement;
    expect(header.getAttribute('draggable')).toBe('true');
    await fireEvent.dragStart(header);
    expect(beginDrag).toHaveBeenCalledWith('p7');
  });

  it('dragstart from the button area does NOT start a drag', async () => {
    const { getByLabelText } = render(PaneHeader, { props: { paneId: 'p7', cwd: '' } });
    await fireEvent.dragStart(getByLabelText('close pane'));
    expect(beginDrag).not.toHaveBeenCalled();
  });

  it('in editing mode the header is not draggable', async () => {
    const onRename = vi.fn();
    const { container, getByText } = render(PaneHeader, { props: { paneId: 'p7', title: 'old', cwd: '', onRename } });
    await fireEvent.dblClick(getByText('old', { exact: false }));
    const header = container.querySelector('.header') as HTMLElement;
    expect(header.getAttribute('draggable')).toBe('false');
  });

  it('dragend calls endDrag', async () => {
    const { container } = render(PaneHeader, { props: { paneId: 'p7', cwd: '' } });
    await fireEvent.dragEnd(container.querySelector('.header')!);
    expect(endDrag).toHaveBeenCalled();
  });
});

describe('PaneHeader — hiding split buttons by size', () => {
  it('by default both split buttons are visible', () => {
    const { queryByLabelText } = render(PaneHeader, { props: { paneId: 'p', cwd: '' } });
    expect(queryByLabelText('split right')).toBeTruthy();
    expect(queryByLabelText('split down')).toBeTruthy();
  });

  it('canSplitV=false hides «split right» (⬌)', () => {
    const { queryByLabelText } = render(PaneHeader, { props: { paneId: 'p', cwd: '', canSplitV: false } });
    expect(queryByLabelText('split right')).toBeNull();
    expect(queryByLabelText('split down')).toBeTruthy();
  });

  it('canSplitH=false hides «split down» (⬍)', () => {
    const { queryByLabelText } = render(PaneHeader, { props: { paneId: 'p', cwd: '', canSplitH: false } });
    expect(queryByLabelText('split down')).toBeNull();
    expect(queryByLabelText('split right')).toBeTruthy();
  });

  it('zoomed=true hides both split buttons (a zoomed pane cannot be split)', () => {
    const { queryByLabelText } = render(PaneHeader, { props: { paneId: 'p', cwd: '', zoomed: true } });
    expect(queryByLabelText('split right')).toBeNull();
    expect(queryByLabelText('split down')).toBeNull();
    // zoom (collapse) and close remain
    expect(queryByLabelText('zoom')).toBeTruthy();
    expect(queryByLabelText('close pane')).toBeTruthy();
  });
});

describe('PaneHeader — md views segment', () => {
  it('shows the </> ⊟ 👁 segment when mdViews + onModeChange', () => {
    const { getByLabelText } = render(PaneHeader, {
      props: { paneId: 'p1', title: 'r.md', mdViews: true, mode: 'source', onModeChange: vi.fn() },
    });
    expect(getByLabelText('source view')).toBeTruthy();
    expect(getByLabelText('split view')).toBeTruthy();
    expect(getByLabelText('preview view')).toBeTruthy();
  });

  it('no segment for a terminal/non-md pane (no mdViews)', () => {
    const { queryByLabelText } = render(PaneHeader, { props: { paneId: 'p1', cwd: '/x' } });
    expect(queryByLabelText('preview view')).toBeNull();
  });

  it('clicking a segment button calls onModeChange with that mode', async () => {
    const onModeChange = vi.fn();
    const { getByLabelText } = render(PaneHeader, {
      props: { paneId: 'p1', title: 'r.md', mdViews: true, mode: 'source', onModeChange },
    });
    await fireEvent.click(getByLabelText('preview view'));
    expect(onModeChange).toHaveBeenCalledWith('preview');
    await fireEvent.click(getByLabelText('split view'));
    expect(onModeChange).toHaveBeenCalledWith('split');
  });

  it('marks the active mode button as aria-pressed', () => {
    const { getByLabelText } = render(PaneHeader, {
      props: { paneId: 'p1', title: 'r.md', mdViews: true, mode: 'split', onModeChange: vi.fn() },
    });
    expect(getByLabelText('split view').getAttribute('aria-pressed')).toBe('true');
    expect(getByLabelText('source view').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('PaneHeader — split type menu (right click)', () => {
  it('right-click on the split button opens the SplitMenu', async () => {
    const { getByLabelText } = render(PaneHeader, { props: { paneId: 'p', title: 't', onSplit: vi.fn(), onSplitAs: vi.fn(), onSplitOpenFile: vi.fn() } });
    const btn = getByLabelText('split right');
    await fireEvent.contextMenu(btn);
    expect(getByLabelText('split menu')).toBeTruthy(); // menu appeared
  });
  it('plain click on split button still splits a terminal (fast path)', async () => {
    const onSplit = vi.fn();
    const { getByLabelText } = render(PaneHeader, { props: { paneId: 'p', title: 't', onSplit } });
    await fireEvent.click(getByLabelText('split right'));
    expect(onSplit).toHaveBeenCalledWith('v');
  });

  // FIX: the menu ignored clicks elsewhere — it only closed via Escape or picking an item.
  it('closes the SplitMenu on a pointerdown outside', async () => {
    const { getByLabelText, queryByLabelText } = render(PaneHeader, {
      props: { paneId: 'p', title: 't', onSplit: vi.fn(), onSplitAs: vi.fn(), onSplitOpenFile: vi.fn() },
    });
    await fireEvent.contextMenu(getByLabelText('split right'));
    expect(getByLabelText('split menu')).toBeTruthy();
    await fireEvent.pointerDown(document.body);
    expect(queryByLabelText('split menu')).toBeNull();
  });

  it('keeps the SplitMenu open on a pointerdown inside the menu', async () => {
    const { getByLabelText } = render(PaneHeader, {
      props: { paneId: 'p', title: 't', onSplit: vi.fn(), onSplitAs: vi.fn(), onSplitOpenFile: vi.fn() },
    });
    await fireEvent.contextMenu(getByLabelText('split right'));
    await fireEvent.pointerDown(getByLabelText('split menu'));
    expect(getByLabelText('split menu')).toBeTruthy();
  });
});

describe('PaneHeader — close button hover styling (stable class)', () => {
  it('close button carries the stable .close-btn class', () => {
    const { getByLabelText } = render(PaneHeader, { props: { paneId: 'p', title: 't' } });
    expect(getByLabelText('close pane').classList.contains('close-btn')).toBe(true);
  });

  it('hover rule targets .close-btn, not the localized aria-label (dead selector fix)', () => {
    const src = readPaneHeaderSource();
    const styleBlock = src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(styleBlock).toMatch(/\.tools\s+button\.close-btn:hover\s*\{[^}]*var\(--exit\)/s);
    expect(styleBlock).not.toContain('[aria-label="close pane"]');
  });
});

describe('PaneHeader — file tabs strip', () => {
  it('renders file tab chips and forwards activate/close', async () => {
    const onActivateFile = vi.fn(), onCloseFile = vi.fn();
    const fileTabs = [
      { fileId: 'a', name: 'README.md', dirty: true, active: true },
      { fileId: 'b', name: 'main.go', dirty: false, active: false },
    ];
    const { getByText, getByLabelText } = render(PaneHeader, { props: { paneId: 'p', fileTabs, onActivateFile, onCloseFile } });
    await fireEvent.click(getByText('main.go'));
    expect(onActivateFile).toHaveBeenCalledWith('b');
    await fireEvent.click(getByLabelText('close README.md'));
    expect(onCloseFile).toHaveBeenCalledWith('a');
  });
  it('shows dirty ● always (not only on hover) on a dirty file chip', async () => {
    const fileTabs = [{ fileId: 'a', name: 'README.md', dirty: true, active: false }];
    const { container } = render(PaneHeader, { props: { paneId: 'p', fileTabs } });
    expect(container.querySelector('.ftab .dot')).toBeTruthy(); // ● on the left, always
  });
  it('the "+" button opens a file (onAddFile)', async () => {
    const onAddFile = vi.fn();
    const fileTabs = [{ fileId: 'a', name: 'README.md', dirty: false, active: true }];
    const { getByLabelText } = render(PaneHeader, { props: { paneId: 'p', fileTabs, onAddFile } });
    await fireEvent.click(getByLabelText('open file'));
    expect(onAddFile).toHaveBeenCalled();
  });
});

describe('PaneHeader — S4 layout', () => {
  it('header uses gap layout, not space-between', () => {
    // jsdom doesn't resolve Svelte scoped styles in computed-style → read the component source
    const { container } = render(PaneHeader, { props: { paneId: 'p', cwd: '/x' } });
    const header = container.querySelector('.header') as HTMLElement;
    expect(header).toBeTruthy();

    const src = readPaneHeaderSource();
    // Cut out the <style> block for a targeted grep
    const styleBlock = src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';

    // After S4.1: justify-content space-between should be gone from .header
    // Look for the .header { ... } block and make sure there's no space-between
    expect(styleBlock).not.toContain('justify-content: space-between');
    // gap: 8px and padding: 0 9px must be present in .header { }
    expect(styleBlock).toMatch(/\.header\s*\{[^}]*gap:\s*8px/s);
    expect(styleBlock).toMatch(/\.header\s*\{[^}]*padding:\s*0 9px/s);
  });
});

describe('PaneHeader — S4.2 status dot', () => {
  it('renders status-dot, not grip ⠿, in terminal branch', () => {
    const { container, queryByText } = render(PaneHeader, { props: { paneId: 'p', cwd: '/x' } });
    expect(container.querySelector('.status-dot')).toBeTruthy();
    expect(queryByText('⠿')).toBeNull();
  });

  it('status-dot carries active/alerted/exited classes', () => {
    const { container } = render(PaneHeader, { props: { paneId: 'p', cwd: '/x', active: true, alerted: true, exited: true } });
    const dot = container.querySelector('.status-dot') as HTMLElement;
    expect(dot.classList.contains('active')).toBe(true);
    expect(dot.classList.contains('alerted')).toBe(true);
    expect(dot.classList.contains('exited')).toBe(true);
  });

  it('renders status-dot, not grip, in editor (fileTabs) branch', () => {
    const fileTabs = [{ fileId: 'a', name: 'a.ts', dirty: false, active: true }];
    const { container, queryByText } = render(PaneHeader, { props: { paneId: 'p', fileTabs } });
    expect(container.querySelector('.status-dot')).toBeTruthy();
    expect(queryByText('⠿')).toBeNull();
  });
});

describe('PaneHeader — S4.3 SVG toolbar', () => {
  it('toolbar buttons contain <svg>, not unicode glyphs', () => {
    const { getByLabelText } = render(PaneHeader, { props: { paneId: 'p', cwd: '/x', onSplit: vi.fn(), onZoom: vi.fn(), onClose: vi.fn() } });
    for (const lbl of ['split right', 'split down', 'zoom', 'close pane']) {
      expect(getByLabelText(lbl).querySelector('svg')).toBeTruthy();
    }
  });

  it('no unicode toolbar glyphs in DOM', () => {
    const { container } = render(PaneHeader, { props: { paneId: 'p', cwd: '/x' } });
    // Check that toolbar glyphs (split/zoom/close) are replaced with SVG — not text symbols
    expect(container.textContent).not.toMatch(/[⬌⬍⤢⇲]/);
  });

  it('toolbar SVG buttons have aria-hidden="true" on their <svg> elements', () => {
    const { getByLabelText } = render(PaneHeader, { props: { paneId: 'p', cwd: '/x', onSplit: vi.fn(), onZoom: vi.fn(), onClose: vi.fn() } });
    for (const lbl of ['split right', 'split down', 'zoom', 'close pane']) {
      const svg = getByLabelText(lbl).querySelector('svg');
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('.tools button svg has correct size (14px) in source CSS', () => {
    // jsdom doesn't apply scoped styles → read the source
    const src = readPaneHeaderSource();
    const styleBlock = src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(styleBlock).toMatch(/\.tools\s+button\s+svg\s*\{[^}]*width:\s*14px/s);
    expect(styleBlock).toMatch(/\.tools\s+button\s+svg\s*\{[^}]*height:\s*14px/s);
  });

  it('.tools opacity is .6 (not .4) in idle state per source CSS', () => {
    const src = readPaneHeaderSource();
    const styleBlock = src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    // After S4.3 opacity should be .6, not .4
    expect(styleBlock).toMatch(/\.tools\s*\{[^}]*opacity:\s*0\.6/s);
    expect(styleBlock).not.toMatch(/\.tools\s*\{[^}]*opacity:\s*0\.4/s);
  });

  it('.tools hover opacity is .85 per source CSS', () => {
    const src = readPaneHeaderSource();
    const styleBlock = src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(styleBlock).toMatch(/\.header:hover\s+\.tools[^{]*\{[^}]*opacity:\s*0\.85/s);
  });
});

describe('PaneHeader — S4.4 pane name 11.5px + weight/color by state', () => {
  it('name is fixed 11.5px, not driven by --ui-font-size', () => {
    const { container } = render(PaneHeader, { props: { paneId: 'p', cwd: '/x' } });
    // jsdom doesn't apply Svelte scoped styles → read the component source
    const src = readPaneHeaderSource();
    const styleBlock = src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(container.querySelector('.name')).toBeTruthy();
    expect(styleBlock).toMatch(/\.name\s*\{[^}]*font-size:\s*11\.5px/s);
    expect(styleBlock).not.toMatch(/\.name\s*\{[^}]*--ui-font-size/s);
  });

  it('active name uses --text bold, header.active drops amber/header-active bg', () => {
    const src = readPaneHeaderSource();
    const styleBlock = src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    // .header.active .name must set font-weight: 600
    expect(styleBlock).toMatch(/\.header\.active\s+\.name\s*\{[^}]*font-weight:\s*600/s);
    // .header.active must not set var(--amber) as color
    expect(styleBlock).not.toMatch(/\.header\.active\s*\{[^}]*var\(--amber\)/s);
    // .header.active must not set background: var(--header-active)
    expect(styleBlock).not.toMatch(/\.header\.active\s*\{[^}]*background:\s*var\(--header-active\)/s);
  });

  it('.name has font-weight: 400 in base state', () => {
    const src = readPaneHeaderSource();
    const styleBlock = src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(styleBlock).toMatch(/\.name\s*\{[^}]*font-weight:\s*400/s);
  });

  it('.name has color: var(--text-dim) in base state', () => {
    const src = readPaneHeaderSource();
    const styleBlock = src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(styleBlock).toMatch(/\.name\s*\{[^}]*color:\s*var\(--text-dim\)/s);
  });

  it('.header.alerted .name uses font-weight: 600', () => {
    const src = readPaneHeaderSource();
    const styleBlock = src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(styleBlock).toMatch(/\.header\.alerted\s+\.name\s*\{[^}]*font-weight:\s*600/s);
  });

  it('ellipsis properties preserved on .name', () => {
    const src = readPaneHeaderSource();
    const styleBlock = src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(styleBlock).toMatch(/\.name\s*\{[^}]*overflow:\s*hidden/s);
    expect(styleBlock).toMatch(/\.name\s*\{[^}]*text-overflow:\s*ellipsis/s);
    expect(styleBlock).toMatch(/\.name\s*\{[^}]*white-space:\s*nowrap/s);
  });

  it('.rename has font: inherit (does not shift after a font-size change)', () => {
    const src = readPaneHeaderSource();
    const styleBlock = src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(styleBlock).toMatch(/\.rename\s*\{[^}]*font:\s*inherit/s);
  });

  it('existing: shows title correctly (rename-flow unbroken)', () => {
    const { getByText } = render(PaneHeader, { props: { paneId: 'p', title: 'build', cwd: '/x' } });
    expect(getByText('build', { exact: false })).toBeTruthy();
  });

  it('existing: falls back to cwd when no title', () => {
    const { getByText } = render(PaneHeader, { props: { paneId: 'p', cwd: '~/proj' } });
    expect(getByText('~/proj', { exact: false })).toBeTruthy();
  });

  it('.header.active .name uses --text color', () => {
    const src = readPaneHeaderSource();
    const styleBlock = src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(styleBlock).toMatch(/\.header\.active\s+\.name\s*\{[^}]*color:\s*var\(--text\)/s);
  });
});

describe('PaneHeader — S4.6 file tabs style', () => {
  it('active tab carries class on; dirty tab shows dot', () => {
    const fileTabs = [
      { fileId: 'a', name: 'a.ts', dirty: true, active: true },
      { fileId: 'b', name: 'b.ts', dirty: false, active: false },
    ];
    const { container } = render(PaneHeader, { props: { paneId: 'p', fileTabs } });
    const tabs = container.querySelectorAll('.ftab');
    expect(tabs[0].classList.contains('on')).toBe(true);
    expect(tabs[1].classList.contains('on')).toBe(false);
    expect(tabs[0].querySelector('.dot')).toBeTruthy();
  });

  it('active tab style = contour pill (border-2) + bg, not accent fill', () => {
    // jsdom doesn't resolve Svelte scoped styles → read the component source
    const src = readFileSync(resolve(__dirname, 'PaneHeader.svelte'), 'utf-8');
    const css = src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(css).toMatch(/\.ftab\.on\s*\{[^}]*var\(--border-2\)/);
    expect(css).not.toMatch(/\.ftab\.on\s*\{[^}]*color-mix\(in srgb, var\(--accent\) 20%/);
  });

  it('active tab .ftab.on has bg: var(--bg) in source CSS', () => {
    const src = readFileSync(resolve(__dirname, 'PaneHeader.svelte'), 'utf-8');
    const css = src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(css).toMatch(/\.ftab\.on\s*\{[^}]*background:\s*var\(--bg\)/);
  });

  it('inactive ftab has no hardcoded background in source CSS', () => {
    const src = readFileSync(resolve(__dirname, 'PaneHeader.svelte'), 'utf-8');
    const css = src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    // #2c2926 should be gone from the base .ftab
    expect(css).not.toMatch(/\.ftab\s*\{[^}]*background:\s*#2c2926/);
  });

  it('.ftab .dot uses var(--accent), not currentColor', () => {
    const src = readFileSync(resolve(__dirname, 'PaneHeader.svelte'), 'utf-8');
    const css = src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(css).toMatch(/\.ftab\s+\.dot\s*\{[^}]*background:\s*var\(--accent\)/);
    expect(css).not.toMatch(/\.ftab\s+\.dot\s*\{[^}]*background:\s*currentColor/);
  });
});

describe('PaneHeader — S4 shell tag', () => {
  it('renders shell-tag when shellTag set', () => {
    const { container } = render(PaneHeader, { props: { paneId: 'p', cwd: '/x', shellTag: 'zsh' } });
    const tag = container.querySelector('.shell-tag') as HTMLElement;
    expect(tag?.textContent).toBe('zsh');
  });
  it('no shell-tag when shellTag undefined', () => {
    const { container } = render(PaneHeader, { props: { paneId: 'p', cwd: '/x' } });
    expect(container.querySelector('.shell-tag')).toBeNull();
  });
  it('no shell-tag when shellTag is empty string (editor/idle)', () => {
    const { container } = render(PaneHeader, { props: { paneId: 'p', cwd: '/x', shellTag: '' } });
    expect(container.querySelector('.shell-tag')).toBeNull();
  });
});

describe('PaneHeader — S4 restart on exit', () => {
  it('exited=true hides split, shows restart', () => {
    const { queryByLabelText } = render(PaneHeader, { props: { paneId: 'p', cwd: '/x', exited: true, onRestart: vi.fn() } });
    expect(queryByLabelText('split right')).toBeNull();
    expect(queryByLabelText('split down')).toBeNull();
    expect(queryByLabelText('restart shell')).toBeTruthy();
  });
  it('live pane: restart hidden, split visible', () => {
    const { queryByLabelText } = render(PaneHeader, { props: { paneId: 'p', cwd: '/x', exited: false } });
    expect(queryByLabelText('restart shell')).toBeNull();
    expect(queryByLabelText('split right')).toBeTruthy();
  });
  it('click restart calls onRestart', async () => {
    const onRestart = vi.fn();
    const { getByLabelText } = render(PaneHeader, { props: { paneId: 'p', cwd: '/x', exited: true, onRestart } });
    await fireEvent.click(getByLabelText('restart shell'));
    expect(onRestart).toHaveBeenCalled();
  });
});
