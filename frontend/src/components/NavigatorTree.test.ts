// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { tick } from 'svelte';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { navDrag, endNavDrag } from '../bridge/navDragState.svelte';
import { dragState, endDrag } from '../bridge/dragState.svelte';
import NavigatorTree from './NavigatorTree.svelte';
import type { NavRow } from '../state/selectors';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Path to the component source for CSS checks (jsdom doesn't inject Svelte 5 <style> tags)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

afterEach(cleanup);

const rows: NavRow[] = [
  { kind: 'space', spaceId: 's1', tabId: null, label: 'alpha', depth: 0, expandable: false, collapsed: false, active: true, tabCount: 1, aggStatus: null },
  { kind: 'space', spaceId: 's2', tabId: null, label: 'beta', depth: 0, expandable: true, collapsed: false, active: false, tabCount: 2, aggStatus: null },
  { kind: 'tab', spaceId: 's2', tabId: 't1', label: 'one', depth: 1, expandable: false, collapsed: false, active: false, tabCount: 0, aggStatus: null },
  { kind: 'tab', spaceId: 's2', tabId: 't2', label: 'two', depth: 1, expandable: false, collapsed: false, active: false, tabCount: 0, aggStatus: null },
];

function spies() {
  return {
    onSelectSpace: vi.fn(),
    onSelectTab: vi.fn(),
    onToggle: vi.fn(),
    onAddSpace: vi.fn(),
    onAddTab: vi.fn(),
    onClose: vi.fn(),
    onRename: vi.fn(),
    onMoveTab: vi.fn(),
    onReorderSpace: vi.fn(),
    onMoveLeaf: vi.fn(),
  };
}

describe('NavigatorTree', () => {
  it('renders a row per nav entry', () => {
    const { getByText } = render(NavigatorTree, { props: { rows, ...spies() } });
    expect(getByText('alpha')).toBeTruthy();
    expect(getByText('beta')).toBeTruthy();
    expect(getByText('one')).toBeTruthy();
  });

  it('clicking a one-tab space row calls onSelectSpace', async () => {
    const p = spies();
    const { getByText } = render(NavigatorTree, { props: { rows, ...p } });
    await fireEvent.click(getByText('alpha'));
    expect(p.onSelectSpace).toHaveBeenCalledWith('s1');
  });

  it('clicking a tab row calls onSelectTab with space+tab', async () => {
    const p = spies();
    const { getByText } = render(NavigatorTree, { props: { rows, ...p } });
    await fireEvent.click(getByText('one'));
    expect(p.onSelectTab).toHaveBeenCalledWith('s2', 't1');
  });

  it('clicking the twisty calls onToggle and does not select the space (stopPropagation)', async () => {
    const p = spies();
    const { getByLabelText } = render(NavigatorTree, { props: { rows, ...p } });
    await fireEvent.click(getByLabelText('toggle'));
    expect(p.onToggle).toHaveBeenCalledWith('s2');
    expect(p.onSelectSpace).not.toHaveBeenCalled();
  });

  it('clicking a row close button calls onClose with that row (stopPropagation)', async () => {
    const p = spies();
    const { getAllByLabelText } = render(NavigatorTree, { props: { rows, ...p } });
    const closeButtons = getAllByLabelText('close');
    await fireEvent.click(closeButtons[0]); // first row = space s1
    expect(p.onClose).toHaveBeenCalledWith(expect.objectContaining({ kind: 'space', spaceId: 's1' }));
    expect(p.onSelectSpace).not.toHaveBeenCalled();
  });

  it('double-clicking a label enters rename mode; Enter commits via onRename', async () => {
    const p = spies();
    const { getByText, getByDisplayValue } = render(NavigatorTree, { props: { rows, ...p } });
    await fireEvent.dblClick(getByText('alpha'));
    const input = getByDisplayValue('alpha') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'renamed' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onRename).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 's1' }), 'renamed');
  });

  it('rename ignores an empty value', async () => {
    const p = spies();
    const { getByText, getByDisplayValue } = render(NavigatorTree, { props: { rows, ...p } });
    await fireEvent.dblClick(getByText('alpha'));
    const input = getByDisplayValue('alpha') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '   ' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onRename).not.toHaveBeenCalled();
  });

  it('Escape cancels rename without calling onRename', async () => {
    const p = spies();
    const { getByText, getByDisplayValue, queryByDisplayValue } = render(NavigatorTree, { props: { rows, ...p } });
    await fireEvent.dblClick(getByText('alpha'));
    const input = getByDisplayValue('alpha') as HTMLInputElement;
    await fireEvent.keyDown(input, { key: 'Escape' });
    expect(p.onRename).not.toHaveBeenCalled();
    expect(queryByDisplayValue('alpha')).toBeNull(); // input gone, back to label
  });

  it('Enter then blur commits only once (guarded against double-commit)', async () => {
    const p = spies();
    const { getByText, getByDisplayValue } = render(NavigatorTree, { props: { rows, ...p } });
    await fireEvent.dblClick(getByText('alpha'));
    const input = getByDisplayValue('alpha') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'renamed' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    await fireEvent.blur(input); // the post-unmount blur a real browser would fire
    expect(p.onRename).toHaveBeenCalledTimes(1);
  });
});

describe('NavigatorTree — DnD', () => {
  afterEach(() => endNavDrag());

  function stubRect(el: Element, top = 0, h = 20) {
    el.getBoundingClientRect = () =>
      ({ left: 0, top, right: 100, bottom: top + h, width: 100, height: h, x: 0, y: top, toJSON() {} }) as DOMRect;
  }
  // rows → <li> in render order
  const lis = (c: HTMLElement) => Array.from(c.querySelectorAll('li')) as HTMLLIElement[];

  it('dragstart on a space row puts the space identity into navDrag', async () => {
    const { container } = render(NavigatorTree, { props: { rows, ...spies() } });
    await fireEvent.dragStart(lis(container)[0]); // s1
    expect(navDrag.dragging).toEqual({ kind: 'space', spaceId: 's1' });
  });

  it('dragstart on a tab row puts the tab identity', async () => {
    const { container } = render(NavigatorTree, { props: { rows, ...spies() } });
    await fireEvent.dragStart(lis(container)[2]); // s2 / t1
    expect(navDrag.dragging).toEqual({ kind: 'tab', spaceId: 's2', tabId: 't1' });
  });

  it('tab drag + drop into the top half of another tab row → moveTab before that tab', async () => {
    const p = spies();
    const { container } = render(NavigatorTree, { props: { rows, ...p } });
    const tabTwo = lis(container)[3]; // s2 / t2
    stubRect(tabTwo);
    navDrag.dragging = { kind: 'tab', spaceId: 's2', tabId: 't1' }; // dragging t1
    await fireEvent.dragOver(tabTwo, { clientY: 2 });   // top half → before
    await fireEvent.drop(tabTwo, { clientY: 2 });
    expect(p.onMoveTab).toHaveBeenCalledWith('t1', 's2', 't2'); // insert t1 before t2
  });

  it('tab drag + drop into the bottom half of the last tab row → moveTab to the end (before=null)', async () => {
    const p = spies();
    const { container } = render(NavigatorTree, { props: { rows, ...p } });
    const tabTwo = lis(container)[3]; // s2 / t2 — the last tab of s2
    stubRect(tabTwo);
    navDrag.dragging = { kind: 'tab', spaceId: 's2', tabId: 't1' };
    await fireEvent.dragOver(tabTwo, { clientY: 18 }); // bottom half → after; no next tab
    await fireEvent.drop(tabTwo, { clientY: 18 });
    expect(p.onMoveTab).toHaveBeenCalledWith('t1', 's2', null);
  });

  it('tab drag + drop onto a space row → moveTab to the end of that space (into)', async () => {
    const p = spies();
    const { container } = render(NavigatorTree, { props: { rows, ...p } });
    const spaceAlpha = lis(container)[0]; // s1 (solo)
    stubRect(spaceAlpha);
    navDrag.dragging = { kind: 'tab', spaceId: 's2', tabId: 't1' };
    await fireEvent.dragOver(spaceAlpha, { clientY: 10 });
    await fireEvent.drop(spaceAlpha, { clientY: 10 });
    expect(p.onMoveTab).toHaveBeenCalledWith('t1', 's1', null);
  });

  it('space drag + drop into the top half of another space row → reorderSpace before it', async () => {
    const p = spies();
    const { container } = render(NavigatorTree, { props: { rows, ...p } });
    const spaceBeta = lis(container)[1]; // s2
    stubRect(spaceBeta);
    navDrag.dragging = { kind: 'space', spaceId: 's1' }; // dragging s1
    await fireEvent.dragOver(spaceBeta, { clientY: 2 }); // before s2
    await fireEvent.drop(spaceBeta, { clientY: 2 });
    expect(p.onReorderSpace).toHaveBeenCalledWith('s1', 's2');
  });

  it('space drag + drop into the bottom half of the last space row → reorderSpace to the end (before=null)', async () => {
    const p = spies();
    const { container } = render(NavigatorTree, { props: { rows, ...p } });
    const spaceBeta = lis(container)[1]; // s2 — the last space
    stubRect(spaceBeta);
    navDrag.dragging = { kind: 'space', spaceId: 's1' };
    await fireEvent.dragOver(spaceBeta, { clientY: 18 }); // after, no next space
    await fireEvent.drop(spaceBeta, { clientY: 18 });
    expect(p.onReorderSpace).toHaveBeenCalledWith('s1', null);
  });

  it('dragging a tab onto itself (before === self) → does not emit', async () => {
    const p = spies();
    const { container } = render(NavigatorTree, { props: { rows, ...p } });
    const tabOne = lis(container)[2]; // s2 / t1
    stubRect(tabOne);
    navDrag.dragging = { kind: 'tab', spaceId: 's2', tabId: 't1' };
    await fireEvent.dragOver(tabOne, { clientY: 2 }); // before t1 == self
    await fireEvent.drop(tabOne, { clientY: 2 });
    expect(p.onMoveTab).not.toHaveBeenCalled();
  });

  it('drop without an active drag is ignored', async () => {
    const p = spies();
    const { container } = render(NavigatorTree, { props: { rows, ...p } });
    const tabTwo = lis(container)[3];
    stubRect(tabTwo);
    endNavDrag(); // dragging === null
    await fireEvent.drop(tabTwo, { clientY: 2 });
    expect(p.onMoveTab).not.toHaveBeenCalled();
    expect(p.onReorderSpace).not.toHaveBeenCalled();
  });

  it('dragend clears navDrag', async () => {
    const { container } = render(NavigatorTree, { props: { rows, ...spies() } });
    await fireEvent.dragStart(lis(container)[0]);
    await fireEvent.dragEnd(lis(container)[0]);
    expect(navDrag.dragging).toBeNull();
  });
});

describe('NavigatorTree — alert badges', () => {
  it('shows a badge with the alert count on a tab when > 0', () => {
    const testRows: NavRow[] = [
      { kind: 'tab', spaceId: 's1', tabId: 't1', label: 'build', depth: 1, expandable: false, collapsed: false, active: false, tabCount: 0, aggStatus: null },
    ];
    const { getByText } = render(NavigatorTree, { props: {
      rows: testRows,
      ...spies(),
      alertCount: (r: NavRow) => (r.tabId === 't1' ? 3 : 0),
    } });
    expect(getByText('3')).toBeTruthy();
  });

  it('does not show a badge on a tab when alertCount = 0', () => {
    const testRows: NavRow[] = [
      { kind: 'tab', spaceId: 's1', tabId: 't1', label: 'build', depth: 1, expandable: false, collapsed: false, active: false, tabCount: 0, aggStatus: null },
    ];
    const { queryByText } = render(NavigatorTree, { props: {
      rows: testRows,
      ...spies(),
      alertCount: (_r: NavRow) => 0,
    } });
    // no badge rendered — no element with just a digit
    expect(queryByText('0')).toBeNull();
  });

  it('a space section does NOT show a numeric badge even when alertCount > 0 (mockup: aggregate = dot)', () => {
    const testRows: NavRow[] = [
      { kind: 'space', spaceId: 's1', tabId: null, label: 'work', depth: 0, expandable: false, collapsed: false, active: true, tabCount: 1, aggStatus: null },
    ];
    const { container, queryByText } = render(NavigatorTree, { props: {
      rows: testRows,
      ...spies(),
      alertCount: (_r: NavRow) => 3,
    } });
    expect(queryByText('3')).toBeNull();
    expect(container.querySelector('.alert-badge')).toBeNull();
  });

  it('does not show a badge when alertCount is not passed (default)', () => {
    const { queryByText } = render(NavigatorTree, { props: { rows, ...spies() } });
    expect(queryByText('0')).toBeNull();
  });

  it('the badge has mockup sizes (radius 8, font 9.5px, height 15px)', () => {
    // S3.5: jsdom doesn't inject Svelte 5 <style> tags into document.head (Style count: 0).
    // To check CSS rules we read the component source file via Node.js fs.
    // This is the only way to verify CSS in a jsdom environment without a browser.
    const src = readFileSync(resolve(__dirname, 'NavigatorTree.svelte'), 'utf-8');
    // The .alert-badge rule must contain the mockup values 15px/8px/9.5px
    expect(src).toMatch(/\.alert-badge[^}]*min-width:\s*15px/);
    expect(src).toMatch(/\.alert-badge[^}]*height:\s*15px/);
    expect(src).toMatch(/\.alert-badge[^}]*border-radius:\s*8px/);
    expect(src).toMatch(/\.alert-badge[^}]*font:[^}]*9\.5px/);
    // Functional check: the badge renders with the right text (on a tab)
    const testRows: NavRow[] = [{ kind: 'tab', spaceId: 's1', tabId: 't1', label: 'build', depth: 1, expandable: false, collapsed: false, active: false, tabCount: 0, aggStatus: null }];
    const { container, getByText } = render(NavigatorTree, { props: { rows: testRows, ...spies(), alertCount: () => 2 } });
    const badge = container.querySelector('.alert-badge') as HTMLElement;
    expect(badge).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
    // Extra invariant: the badge is NOT interactive (not a button, not an a)
    expect(badge.tagName.toLowerCase()).not.toBe('button');
    expect(badge.tagName.toLowerCase()).not.toBe('a');
  });
});

describe('NavigatorTree — status-dot', () => {
  const lis = (c: HTMLElement) => Array.from(c.querySelectorAll('li')) as HTMLLIElement[];

  it('renders .status-dot for a tab row', () => {
    const { container } = render(NavigatorTree, { props: {
      rows,
      ...spies(),
      rowStatus: (r: NavRow) => r.tabId === 't1' ? 'running' : 'idle',
    } });
    // li[2] = third row = tab t1 (space s1, space s2, tab t1, tab t2)
    const dot = container.querySelector('li:nth-of-type(3) .status-dot') as HTMLElement | null;
    expect(dot).not.toBeNull();
    expect(dot!.style.background).toContain('var(--green)');
  });

  it('does not render .status-dot for a space row', () => {
    const { container } = render(NavigatorTree, { props: {
      rows,
      ...spies(),
      rowStatus: (_r: NavRow) => 'active',
    } });
    // li[0] = space s1 — it must not have a .status-dot
    const dot = container.querySelector('li:nth-of-type(1) .status-dot');
    expect(dot).toBeNull();
  });

  it('rerender reactivity test: changing rowStatus updates the dot color', async () => {
    const { container, rerender } = render(NavigatorTree, { props: {
      rows,
      ...spies(),
      rowStatus: (_r: NavRow) => 'idle',
    } });
    const dot = container.querySelector('li:nth-of-type(3) .status-dot') as HTMLElement | null;
    expect(dot).not.toBeNull();
    expect(dot!.style.background).toContain('var(--idle)');
    await rerender({ rowStatus: (_r: NavRow) => 'alert' });
    await tick();
    expect(dot!.style.background).toContain('var(--alert)');
  });
});

describe('NavigatorTree — moving a console (pane drag)', () => {
  afterEach(() => { endDrag(); endNavDrag(); });

  function stubRect(el: Element, top = 0, h = 20) {
    el.getBoundingClientRect = () =>
      ({ left: 0, top, right: 100, bottom: top + h, width: 100, height: h, x: 0, y: top, toJSON() {} }) as DOMRect;
  }
  const lis = (c: HTMLElement) => Array.from(c.querySelectorAll('li')) as HTMLLIElement[];

  it('pane drag over a tab row → drop emits onMoveLeaf with target tab', async () => {
    const p = spies();
    const { container } = render(NavigatorTree, { props: { rows, ...p } });
    const tabOne = lis(container)[2]; // s2 / t1
    stubRect(tabOne);
    dragState.dragId = 'paneX';                         // pane drag active
    await fireEvent.dragOver(tabOne, { clientY: 5 });
    await fireEvent.drop(tabOne, { clientY: 5 });
    expect(p.onMoveLeaf).toHaveBeenCalledWith('paneX', { kind: 'tab', spaceId: 's2', tabId: 't1' });
    expect(p.onMoveTab).not.toHaveBeenCalled();          // nav logic didn't fire
  });

  it('pane drag over a space row → drop emits onMoveLeaf with target space', async () => {
    const p = spies();
    const { container } = render(NavigatorTree, { props: { rows, ...p } });
    const spaceAlpha = lis(container)[0]; // s1
    stubRect(spaceAlpha);
    dragState.dragId = 'paneX';
    await fireEvent.dragOver(spaceAlpha, { clientY: 5 });
    await fireEvent.drop(spaceAlpha, { clientY: 5 });
    expect(p.onMoveLeaf).toHaveBeenCalledWith('paneX', { kind: 'space', spaceId: 's1' });
  });

  it('pane drag highlights the row (.drop-into) on dragover', async () => {
    const { container } = render(NavigatorTree, { props: { rows, ...spies() } });
    const tabOne = lis(container)[2];
    stubRect(tabOne);
    dragState.dragId = 'paneX';
    await fireEvent.dragOver(tabOne, { clientY: 5 });
    expect(tabOne.classList.contains('drop-into')).toBe(true);
  });

  it('isolation: nav drag does NOT emit onMoveLeaf (dragState empty)', async () => {
    const p = spies();
    const { container } = render(NavigatorTree, { props: { rows, ...p } });
    const tabTwo = lis(container)[3];
    stubRect(tabTwo);
    navDrag.dragging = { kind: 'tab', spaceId: 's2', tabId: 't1' }; // nav drag, dragState empty
    await fireEvent.dragOver(tabTwo, { clientY: 2 });
    await fireEvent.drop(tabTwo, { clientY: 2 });
    expect(p.onMoveLeaf).not.toHaveBeenCalled();
    expect(p.onMoveTab).toHaveBeenCalled();              // existing nav logic intact
  });

  it('the highlight fades when the pane drag finishes (dragId → null)', async () => {
    const { container } = render(NavigatorTree, { props: { rows, ...spies() } });
    const tabOne = lis(container)[2];
    stubRect(tabOne);
    dragState.dragId = 'paneX';
    await fireEvent.dragOver(tabOne, { clientY: 5 });
    expect(tabOne.classList.contains('drop-into')).toBe(true);
    endDrag();                       // simulate PaneHeader → ondragend
    await tick();                    // let the $effect run and update the DOM
    expect(tabOne.classList.contains('drop-into')).toBe(false);
  });
});

describe('NavigatorTree — S3.1 SPACES header (brand and footer removed)', () => {
  it('renders the SPACES header, without the ● TILZIO brand and without the ＋ new space footer', () => {
    const { getByText, queryByText } = render(NavigatorTree, { props: { rows, ...spies() } });
    expect(getByText('SPACES')).toBeTruthy();
    expect(queryByText('● TILZIO')).toBeNull();
    expect(queryByText(/new space/i)).toBeNull();
  });
  it('clicking the ＋ button in the header (New space) calls onAddSpace once', async () => {
    const p = spies();
    const { getByLabelText } = render(NavigatorTree, { props: { rows, ...p } });
    await fireEvent.click(getByLabelText('New space'));
    expect(p.onAddSpace).toHaveBeenCalledTimes(1);
  });
});

describe('NavigatorTree — S3.2 UPPERCASE space section (counter + aggregate dot)', () => {
  it('a space row shows the tab counter and the name in UPPERCASE (label not mutated)', () => {
    const r: NavRow[] = [{ kind: 'space', spaceId: 's2', tabId: null, label: 'beta', depth: 0, expandable: true, collapsed: false, active: false, tabCount: 2, aggStatus: null }];
    const { container, getByText } = render(NavigatorTree, { props: { rows: r, ...spies() } });
    expect(getByText('beta')).toBeTruthy();               // the DOM contains the original 'beta'
    expect(container.querySelector('.tab-count')!.textContent).toContain('2');
  });

  it('a collapsed space with rowStatus!=="idle" renders an aggregate dot; an expanded one — no', () => {
    // aggStatus in NavRow is always null (pure invariant); the aggregate is colored via the rowStatus callback
    const collapsed: NavRow[] = [{ kind: 'space', spaceId: 's2', tabId: null, label: 'beta', depth: 0, expandable: true, collapsed: true, active: false, tabCount: 2, aggStatus: null }];
    const { container } = render(NavigatorTree, { props: { rows: collapsed, ...spies(), rowStatus: () => 'running' as const } });
    expect(container.querySelector('.space-row .status-dot')).toBeTruthy();
  });
});

describe('NavigatorTree — S3.6 hover-reveal of actions (opacity, not display:none)', () => {
  it('the add tab/close buttons are present in the DOM regardless of hover (a11y, not display:none)', () => {
    const multiTab: NavRow[] = [{ kind: 'space', spaceId: 's2', tabId: null, label: 'beta', depth: 0, expandable: true, collapsed: false, active: false, tabCount: 2, aggStatus: null }];
    const { container, getByLabelText } = render(NavigatorTree, { props: { rows: multiTab, ...spies() } });
    expect(getByLabelText('add tab')).toBeTruthy();
    expect(getByLabelText('close')).toBeTruthy();
    const actions = container.querySelector('.actions') as HTMLElement;
    expect(getComputedStyle(actions).display).not.toBe('none'); // hidden via opacity, not display
  });
  it('clicking close does not call onSelectSpace (stopPropagation preserved)', async () => {
    const p = spies();
    const multiTab: NavRow[] = [{ kind: 'space', spaceId: 's2', tabId: null, label: 'beta', depth: 0, expandable: true, collapsed: false, active: false, tabCount: 2, aggStatus: null }];
    const { getByLabelText } = render(NavigatorTree, { props: { rows: multiTab, ...p } });
    await fireEvent.click(getByLabelText('close'));
    expect(p.onClose).toHaveBeenCalled();
    expect(p.onSelectSpace).not.toHaveBeenCalled();
  });
  it('CSS .actions uses opacity, not display:none, to hide', () => {
    // jsdom doesn't inject Svelte 5 <style> — we check via the source
    const src = readFileSync(resolve(__dirname, 'NavigatorTree.svelte'), 'utf-8');
    // .actions must have opacity:0, not display:none
    expect(src).toMatch(/\.actions[^}]*opacity:\s*0/);
    // reveal via hover/focus-within — opacity:1
    expect(src).toMatch(/\.actions.*opacity:\s*1/s);
    // pointer-events is reset, not display
    expect(src).toMatch(/\.actions[^}]*pointer-events:\s*none/);
  });
});

describe('NavigatorTree — brand removed from the navigator', () => {
  it('no brand bar (neither .brand nor .logotype) — the top of the navigator = the SPACES header', () => {
    const { container } = render(NavigatorTree, { props: { rows, ...spies() } });
    expect(container.querySelector('.brand')).toBeNull();
    expect(container.querySelector('.logotype')).toBeNull();
    expect(container.textContent).not.toContain('tilzio');
    // the first visible block of the navigator is the SPACES header
    expect(container.querySelector('.nav-head .head-label')?.textContent).toBe('SPACES');
  });
});

describe('NavigatorTree — S3.4 active row accent bar', () => {
  afterEach(() => endNavDrag());

  const lis = (c: HTMLElement) => Array.from(c.querySelectorAll('li')) as HTMLLIElement[];

  function stubRect(el: Element, top = 0, h = 20) {
    el.getBoundingClientRect = () =>
      ({ left: 0, top, right: 100, bottom: top + h, width: 100, height: h, x: 0, y: top, toJSON() {} }) as DOMRect;
  }

  it('a row with active=true has the li.active class; the others — no', () => {
    const { container } = render(NavigatorTree, { props: { rows, ...spies() } });
    const items = lis(container);
    expect(items[0].classList.contains('active')).toBe(true);   // s1 active
    expect(items[1].classList.contains('active')).toBe(false);  // s2
  });

  it('an active row under drop keeps both classes (active + drop-before)', async () => {
    const { container } = render(NavigatorTree, { props: { rows, ...spies() } });
    const active = lis(container)[0]; // s1 — active
    stubRect(active);
    navDrag.dragging = { kind: 'space', spaceId: 's2' };       // dragging another space
    await fireEvent.dragOver(active, { clientY: 2 });          // before s1
    expect(active.classList.contains('active')).toBe(true);
    expect(active.classList.contains('drop-before')).toBe(true);
  });
});
