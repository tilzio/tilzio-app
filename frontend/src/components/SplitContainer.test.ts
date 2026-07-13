// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import SplitContainer from './SplitContainer.svelte';
import { newLeaf, newSplit, newEditorLeaf } from '../state/types';
import type { Leaf } from '../state/types';
import { dragState, endDrag } from '../bridge/dragState.svelte';

// Render with the DOM-only TerminalPane stub from __mocks__ (no xterm in jsdom).
vi.mock('./TerminalPane.svelte');
vi.mock('./EditorPane.svelte');

function props(node: any, zoomedPaneId: string | null = null) {
  return {
    node,
    activePaneId: '',
    zoomedPaneId,
    onFocus: vi.fn(),
    onSplit: vi.fn(),
    onClose: vi.fn(),
    onZoom: vi.fn(),
    onResize: vi.fn(),
    onRename: vi.fn(),
    onModeChange: vi.fn(),
    onMovePane: vi.fn(),
    onSplitAs: vi.fn(),
    onSplitOpenFile: vi.fn(),
    onOpenFileHere: vi.fn(),
    onActivateFile: vi.fn(),
    onCloseFile: vi.fn(),
    onMakeTerminal: vi.fn(),
  };
}

describe('SplitContainer', () => {
  it('renders one pane per leaf in the tree', () => {
    const tree = newSplit('v', [newLeaf(), newSplit('h', [newLeaf(), newLeaf()])]);
    const { container } = render(SplitContainer, { props: props(tree) });
    expect(container.querySelectorAll('[data-pane-id]')).toHaveLength(3);
  });

  it('renders a divider between each pair of siblings', () => {
    const tree = newSplit('v', [newLeaf(), newLeaf(), newLeaf()]);
    const { container } = render(SplitContainer, { props: props(tree) });
    expect(container.querySelectorAll('.divider')).toHaveLength(2); // n-1 dividers
  });

  it('zoom hides the cells that do not contain the zoomed pane', () => {
    const a = newLeaf();
    const b = newLeaf();
    const tree = newSplit('v', [a, b]);
    const { container } = render(SplitContainer, { props: props(tree, b.id) });
    const cells = Array.from(container.querySelectorAll<HTMLElement>(':scope > .split > .cell'));
    expect(cells).toHaveLength(2);
    // The cell holding `a` is hidden; the cell holding `b` is visible.
    const hidden = cells.filter((c) => c.style.display === 'none');
    expect(hidden).toHaveLength(1);
    expect(hidden[0].querySelector(`[data-pane-id="${(a as Leaf).id}"]`)).toBeTruthy();
  });

  it('hides all dividers while zoomed', () => {
    const a = newLeaf();
    const b = newLeaf();
    const tree = newSplit('v', [a, b]);
    const { container } = render(SplitContainer, { props: props(tree, b.id) });
    const dividers = Array.from(container.querySelectorAll<HTMLElement>('.divider'));
    expect(dividers.every((d) => d.style.display === 'none')).toBe(true);
  });
});

describe('SplitContainer — leaf drop zones', () => {
  function stubRect(el: Element, w = 100, h = 100) {
    el.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0, toJSON() {} }) as DOMRect;
  }

  it('drop into the leaf center → swap onto that leaf', async () => {
    const a = newLeaf(); const b = newLeaf();
    const p = props(newSplit('v', [a, b]));
    const { container } = render(SplitContainer, { props: p });
    const leaf = container.querySelector('.leaf') as HTMLElement; // first leaf (A)
    stubRect(leaf);
    dragState.dragId = b.id; // dragging B
    await fireEvent.dragOver(leaf, { clientX: 50, clientY: 50 });
    await fireEvent.drop(leaf, { clientX: 50, clientY: 50 });
    expect(p.onMovePane).toHaveBeenCalledWith(b.id, { kind: 'swap', leafId: a.id });
    endDrag();
  });

  it('drop on the left edge of the leaf → edge left', async () => {
    const a = newLeaf(); const b = newLeaf();
    const p = props(newSplit('v', [a, b]));
    const { container } = render(SplitContainer, { props: p });
    const leaf = container.querySelector('.leaf') as HTMLElement;
    stubRect(leaf);
    dragState.dragId = b.id;
    await fireEvent.drop(leaf, { clientX: 5, clientY: 50 });
    expect(p.onMovePane).toHaveBeenCalledWith(b.id, { kind: 'edge', leafId: a.id, side: 'left' });
    endDrag();
  });

  it('without an active drag the drop is ignored', async () => {
    const a = newLeaf();
    const p = props(a);
    const { container } = render(SplitContainer, { props: p });
    const leaf = container.querySelector('.leaf') as HTMLElement;
    stubRect(leaf);
    endDrag(); // dragId === null
    await fireEvent.drop(leaf, { clientX: 50, clientY: 50 });
    expect(p.onMovePane).not.toHaveBeenCalled();
  });

  // FIX: without dragleave the highlight lingered after the drag left the pane.
  it('clears the drop highlight when the drag leaves the leaf', async () => {
    const a = newLeaf(); const b = newLeaf();
    const { container } = render(SplitContainer, { props: props(newSplit('v', [a, b])) });
    const leaf = container.querySelector('.leaf') as HTMLElement;
    stubRect(leaf);
    dragState.dragId = b.id;
    await fireEvent.dragOver(leaf, { clientX: 50, clientY: 50 });
    expect(leaf.querySelector('.drop-hl')).toBeTruthy();
    await fireEvent.dragLeave(leaf, { relatedTarget: document.body });
    expect(leaf.querySelector('.drop-hl')).toBeNull();
    endDrag();
  });

  it('keeps the highlight when dragleave only moves onto a child element (noise)', async () => {
    const a = newLeaf(); const b = newLeaf();
    const { container } = render(SplitContainer, { props: props(newSplit('v', [a, b])) });
    const leaf = container.querySelector('.leaf') as HTMLElement;
    stubRect(leaf);
    dragState.dragId = b.id;
    await fireEvent.dragOver(leaf, { clientX: 50, clientY: 50 });
    const child = leaf.querySelector('[data-pane-id]') as HTMLElement;
    await fireEvent.dragLeave(leaf, { relatedTarget: child });
    expect(leaf.querySelector('.drop-hl')).toBeTruthy();
    endDrag();
  });

  it('does not clobber another leaf\'s candidate on dragleave', async () => {
    const a = newLeaf(); const b = newLeaf();
    const { container } = render(SplitContainer, { props: props(newSplit('v', [a, b])) });
    const leaves = container.querySelectorAll<HTMLElement>('.leaf');
    stubRect(leaves[0]); stubRect(leaves[1]);
    dragState.dragId = 'drag-x';
    // Candidate already moved to leaf B; a late dragleave from leaf A must not clear it.
    dragState.candidate = { kind: 'swap', leafId: b.id };
    await fireEvent.dragLeave(leaves[0], { relatedTarget: document.body });
    expect(dragState.candidate).toEqual({ kind: 'swap', leafId: b.id });
    endDrag();
  });
});

describe('SplitContainer zoom fill', () => {
  it('the visible cell fills (flex-grow 1) when zoomed, not a collapsing fraction', () => {
    const a = newLeaf();
    const b = newLeaf();
    const tree = newSplit('v', [a, b]); // even ratios [0.5, 0.5]
    const { container } = render(SplitContainer, { props: props(tree, b.id) });
    const cells = Array.from(container.querySelectorAll<HTMLElement>(':scope > .split > .cell'));
    const visible = cells.filter((c) => c.style.display !== 'none');
    expect(visible).toHaveLength(1);
    expect(visible[0].style.flexGrow).toBe('1');
  });

  it('uses the ratio for flex-grow when not zoomed', () => {
    const tree = newSplit('v', [newLeaf(), newLeaf()], [0.7, 0.3]);
    const { container } = render(SplitContainer, { props: props(tree) });
    const cells = Array.from(container.querySelectorAll<HTMLElement>(':scope > .split > .cell'));
    expect(cells[0].style.flexGrow).not.toBe('1');
    expect(cells[0].style.flexGrow).toBe('0.7');
  });
});

describe('SplitContainer render dispatch', () => {
  it('renders an EditorPane for an editor leaf', () => {
    const e = newEditorLeaf('/x.md');
    const { container } = render(SplitContainer, { props: props(e) });
    const pane = container.querySelector(`[data-pane-id="${e.id}"]`);
    expect(pane).toBeTruthy();
    expect(pane?.getAttribute('data-pane-kind')).toBe('editor');
  });

  it('mixed tree renders both terminal and editor leaves', () => {
    const term = newLeaf();
    const ed = newEditorLeaf('/a.ts');
    const tree = newSplit('v', [term, ed]);
    const { container } = render(SplitContainer, { props: props(tree) });
    expect(container.querySelectorAll('[data-pane-id]')).toHaveLength(2);
    expect(container.querySelector(`[data-pane-id="${ed.id}"][data-pane-kind="editor"]`)).toBeTruthy();
  });
});

describe('SplitContainer — editor callbacks wiring', () => {
  it('passes files and activeFileId to EditorPane', () => {
    const ed = newEditorLeaf('/x.md');
    const p = props(ed);
    const { container } = render(SplitContainer, { props: p });
    const pane = container.querySelector(`[data-pane-id="${ed.id}"]`);
    expect(pane?.getAttribute('data-pane-kind')).toBe('editor');
    expect(pane?.getAttribute('data-file-count')).toBe('1');
    expect(pane?.getAttribute('data-active-file-id')).toBe(ed.activeFileId);
  });

  it('onSplitAs fires with node.id and dir', async () => {
    const ed = newEditorLeaf('/a.ts');
    const p = props(ed);
    const { container } = render(SplitContainer, { props: p });
    await fireEvent.click(container.querySelector('[aria-label="split-as-v"]')!);
    expect(p.onSplitAs).toHaveBeenCalledWith(ed.id, 'v');
  });

  it('onOpenFileHere fires with node.id', async () => {
    const ed = newEditorLeaf('/a.ts');
    const p = props(ed);
    const { container } = render(SplitContainer, { props: p });
    await fireEvent.click(container.querySelector('[aria-label="open-file-here"]')!);
    expect(p.onOpenFileHere).toHaveBeenCalledWith(ed.id);
  });

  it('onActivateFile fires with node.id and fileId', async () => {
    const ed = newEditorLeaf('/a.ts');
    const p = props(ed);
    const { container } = render(SplitContainer, { props: p });
    await fireEvent.click(container.querySelector('[aria-label="activate-file"]')!);
    expect(p.onActivateFile).toHaveBeenCalledWith(ed.id, 'test-fid');
  });

  it('onMakeTerminal fires with node.id', async () => {
    const ed = newEditorLeaf('/a.ts');
    const p = props(ed);
    const { container } = render(SplitContainer, { props: p });
    await fireEvent.click(container.querySelector('[aria-label="make-terminal"]')!);
    expect(p.onMakeTerminal).toHaveBeenCalledWith(ed.id);
  });
});

describe('SplitContainer — divider drop + highlight', () => {
  beforeEach(() => endDrag()); // clean DnD state before each test

  it('drop on the divider → target divider with splitId and index=i+1', async () => {
    const tree = newSplit('v', [newLeaf(), newLeaf()]); // one divider (i=0 → index 1)
    const p = props(tree);
    const { container } = render(SplitContainer, { props: p });
    const divider = container.querySelector('.divider') as HTMLElement;
    dragState.dragId = 'drag-x';
    await fireEvent.drop(divider);
    expect(p.onMovePane).toHaveBeenCalledWith('drag-x', { kind: 'divider', splitId: tree.id, index: 1 });
    endDrag();
  });

  it('center highlight on the swap candidate leaf', () => {
    const a = newLeaf(); const b = newLeaf();
    dragState.dragId = b.id;
    dragState.candidate = { kind: 'swap', leafId: a.id };
    const { container } = render(SplitContainer, { props: props(newSplit('v', [a, b])) });
    const leafA = container.querySelector(`[data-pane-id="${a.id}"]`)!.closest('.leaf')!;
    expect(leafA.querySelector('.drop-hl.center')).toBeTruthy();
    endDrag();
  });

  it('edge-side highlight on the candidate leaf', () => {
    const a = newLeaf(); const b = newLeaf();
    dragState.dragId = b.id;
    dragState.candidate = { kind: 'edge', leafId: a.id, side: 'left' };
    const { container } = render(SplitContainer, { props: props(newSplit('v', [a, b])) });
    const leafA = container.querySelector(`[data-pane-id="${a.id}"]`)!.closest('.leaf')!;
    expect(leafA.querySelector('.drop-hl.left')).toBeTruthy();
    endDrag();
  });

  it('candidate divider highlight', () => {
    const tree = newSplit('v', [newLeaf(), newLeaf()]);
    dragState.dragId = 'drag-x';
    dragState.candidate = { kind: 'divider', splitId: tree.id, index: 1 };
    const { container } = render(SplitContainer, { props: props(tree) });
    expect(container.querySelector('.divider.draghint')).toBeTruthy();
    endDrag();
  });
});
