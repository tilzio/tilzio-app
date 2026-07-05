<script lang="ts">
  import type { NavRow } from '../state/selectors';
  import { navDrag, beginNavDrag, setNavCandidate, endNavDrag, type NavCandidate } from '../bridge/navDragState.svelte';
  import { dragState, endDrag as endPaneDrag } from '../bridge/dragState.svelte';
  import type { NavMoveTarget } from '../state/types';
  import { paneStatusDotColor, type PaneStatus } from '../state/paneStatus';
  import { t } from '../i18n/index.svelte';

  let {
    rows,
    onSelectSpace,
    onSelectTab,
    onToggle,
    onAddSpace,
    onAddTab,
    onClose,
    onRename,
    onMoveTab,
    onReorderSpace,
    alertCount = () => 0,
    onMoveLeaf = () => {},
    rowStatus = () => 'idle' as PaneStatus,
  }: {
    rows: NavRow[];
    onSelectSpace: (spaceId: string) => void;
    onSelectTab: (spaceId: string, tabId: string) => void;
    onToggle: (spaceId: string) => void;
    onAddSpace: () => void;
    onAddTab: (spaceId: string) => void;
    onClose: (row: NavRow) => void;
    onRename: (row: NavRow, label: string) => void;
    onMoveTab: (tabId: string, toSpaceId: string, beforeTabId: string | null) => void;
    onReorderSpace: (spaceId: string, beforeSpaceId: string | null) => void;
    alertCount?: (row: NavRow) => number;
    onMoveLeaf?: (dragId: string, target: NavMoveTarget) => void;
    rowStatus?: (row: NavRow) => PaneStatus;
  } = $props();

  let editingKey = $state<string | null>(null);
  let editValue = $state('');

  // Highlight of the row under a pane drag (moving a console). Cleared when the pane drag
  // finishes (PaneHeader → endDrag → dragId === null). A stale highlight over the tab area
  // (the drag left the navigator) is acceptable — it's brief and fades on drop/dragend.
  let paneDragRow = $state<string | null>(null);
  $effect(() => { if (dragState.dragId === null) paneDragRow = null; });

  function rowKey(row: NavRow): string {
    return row.kind + row.spaceId + (row.tabId ?? '');
  }
  function onRowClick(row: NavRow) {
    if (row.kind === 'tab' && row.tabId) onSelectTab(row.spaceId, row.tabId);
    else onSelectSpace(row.spaceId);
  }
  function startRename(row: NavRow) {
    editingKey = rowKey(row);
    editValue = row.label;
  }
  function commitRename(row: NavRow) {
    // Guard: after Enter clears editingKey the input unmounts, and a real browser
    // fires blur on the removed (focused) element → a second commit. Bail if this
    // row is no longer being edited so onRename fires at most once.
    if (editingKey !== rowKey(row)) return;
    const v = editValue.trim();
    if (v) onRename(row, v);
    editingKey = null;
  }

  // --- Navigator DnD (Plan 4c) ---------------------------------------------
  // Neighbors by rows render order (to resolve the before target and the highlight).
  function nextSpaceIdAfter(spaceId: string): string | null {
    const spaceIds = rows.filter((r) => r.kind === 'space').map((r) => r.spaceId);
    const i = spaceIds.indexOf(spaceId);
    return i >= 0 && i + 1 < spaceIds.length ? spaceIds[i + 1] : null;
  }
  function nextTabSameSpace(row: NavRow): string | null {
    const i = rows.findIndex((r) => rowKey(r) === rowKey(row));
    const nx = rows[i + 1];
    return nx && nx.kind === 'tab' && nx.spaceId === row.spaceId ? nx.tabId : null;
  }
  function topHalf(e: DragEvent): boolean {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientY < r.top + r.height / 2;
  }

  // (drag, row, half) → candidate for the highlight (null = invalid target).
  function candidateFor(row: NavRow, before: boolean): NavCandidate | null {
    const d = navDrag.dragging;
    if (!d) return null;
    if (d.kind === 'space') {
      if (row.kind !== 'space') return null;           // spaces — only between space rows
      return { rowKey: rowKey(row), pos: before ? 'before' : 'after' };
    }
    // d.kind === 'tab'
    if (row.kind === 'space') return { rowKey: rowKey(row), pos: 'into' };
    return { rowKey: rowKey(row), pos: before ? 'before' : 'after' };
  }

  function onRowDragStart(e: DragEvent, row: NavRow) {
    if (editingKey === rowKey(row)) { e.preventDefault(); return; } // don't drag while in rename mode
    if (row.kind === 'tab' && row.tabId) beginNavDrag({ kind: 'tab', spaceId: row.spaceId, tabId: row.tabId });
    else beginNavDrag({ kind: 'space', spaceId: row.spaceId });
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }
  function onRowDragOver(e: DragEvent, row: NavRow) {
    if (dragState.dragId !== null) {                   // pane drag (moving a console) — takes priority
      e.preventDefault();
      paneDragRow = rowKey(row);
      return;
    }
    if (navDrag.dragging === null) return;
    e.preventDefault();                                 // allow drop
    setNavCandidate(candidateFor(row, topHalf(e)));
  }
  function onRowDrop(e: DragEvent, row: NavRow) {
    if (dragState.dragId !== null) {                   // pane drag → move a console
      e.preventDefault();
      const dragId = dragState.dragId;
      const target: NavMoveTarget = row.kind === 'tab' && row.tabId
        ? { kind: 'tab', spaceId: row.spaceId, tabId: row.tabId }
        : { kind: 'space', spaceId: row.spaceId };
      paneDragRow = null;
      endPaneDrag();
      onMoveLeaf(dragId, target);
      return;
    }
    const d = navDrag.dragging;
    if (d === null) return;
    e.preventDefault();
    const before = topHalf(e);
    endNavDrag();
    if (d.kind === 'space') {
      if (row.kind !== 'space') return;
      const beforeSpaceId = before ? row.spaceId : nextSpaceIdAfter(row.spaceId);
      if (beforeSpaceId === d.spaceId) return;          // self-drop
      onReorderSpace(d.spaceId, beforeSpaceId);
      return;
    }
    // d.kind === 'tab'
    if (row.kind === 'space') { onMoveTab(d.tabId, row.spaceId, null); return; } // to the end of the space
    const beforeTabId = before ? row.tabId : nextTabSameSpace(row);
    if (beforeTabId === d.tabId) return;                // self-drop (into its own slot)
    onMoveTab(d.tabId, row.spaceId, beforeTabId);
  }
</script>

<nav class="navigator">
  <!-- S3.1: SPACES header + ＋ button (brand lockup removed from the navigator by request) -->
  <header class="nav-head">
    <span class="head-label">{t('nav.spaces')}</span>
    <button class="head-add" aria-label={t('nav.addSpace')} title={t('nav.addSpace')} onclick={onAddSpace}>＋</button>
  </header>
  <ul>
    {#each rows as row (rowKey(row))}
      <li
        class:active={row.active}
        class:space-row={row.kind === 'space'}
        class:drop-before={navDrag.candidate?.rowKey === rowKey(row) && navDrag.candidate.pos === 'before'}
        class:drop-after={navDrag.candidate?.rowKey === rowKey(row) && navDrag.candidate.pos === 'after'}
        class:drop-into={(navDrag.candidate?.rowKey === rowKey(row) && navDrag.candidate.pos === 'into') || paneDragRow === rowKey(row)}
        style="padding-left: {row.depth * 14 + 8 + (row.kind === 'tab' ? 8 : 0)}px"
        draggable={editingKey !== rowKey(row)}
        ondragstart={(e) => onRowDragStart(e, row)}
        ondragover={(e) => onRowDragOver(e, row)}
        ondrop={(e) => onRowDrop(e, row)}
        ondragend={() => endNavDrag()}
      >
        {#if row.kind === 'space'}
          <!-- S3.2: space section — twisty + UPPERCASE name + aggregate dot (collapsed) + counter -->
          {#if row.expandable}
            <button
              class="twisty"
              aria-label={t('nav.toggle')}
              onclick={(e) => { e.stopPropagation(); onToggle(row.spaceId); }}
            >{row.collapsed ? '▸' : '▾'}</button>
          {:else}
            <!-- S3.2: spacer in place of the twisty — section names aligned as in the mockup -->
            <span class="twisty" aria-hidden="true"></span>
          {/if}
          {#if editingKey === rowKey(row)}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="rename"
              bind:value={editValue}
              autofocus
              onkeydown={(e) => {
                if (e.key === 'Enter') commitRename(row);
                else if (e.key === 'Escape') editingKey = null;
              }}
              onblur={() => commitRename(row)}
            />
          {:else}
            <button
              class="label space-name"
              onclick={() => onRowClick(row)}
              ondblclick={() => startRename(row)}
            >{row.label}</button>
          {/if}
          <!-- Aggregate dot: shown on a collapsed space with a non-idle status (rowStatus callback) -->
          {#if row.collapsed && rowStatus(row) !== 'idle'}
            <span class="status-dot agg" style="background:{paneStatusDotColor(rowStatus(row))}"></span>
          {/if}
          <span class="tab-count">{row.tabCount}</span>
          <!-- S3.5: on a space section the aggregate is shown by a dot (collapsed), the numeric badge — only on a tab (mockup) -->
          <span class="actions">
            <button
              class="add-tab"
              aria-label={t('nav.addTab')}
              onclick={(e) => { e.stopPropagation(); onAddTab(row.spaceId); }}
            >+</button>
            <button
              class="close"
              aria-label={t('nav.close')}
              onclick={(e) => { e.stopPropagation(); onClose(row); }}
            >×</button>
          </span>
        {:else}
          <!-- Tab row: status dot + label -->
          <!-- Tab status dot: color from paneStatusDotColor (SSOT S1) -->
          <span class="status-dot" style="background:{paneStatusDotColor(rowStatus(row))}"></span>
          {#if editingKey === rowKey(row)}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="rename"
              bind:value={editValue}
              autofocus
              onkeydown={(e) => {
                if (e.key === 'Enter') commitRename(row);
                else if (e.key === 'Escape') editingKey = null;
              }}
              onblur={() => commitRename(row)}
            />
          {:else}
            <button
              class="label"
              class:dim={!row.active && (rowStatus(row) === 'running' || rowStatus(row) === 'alert')}
              onclick={() => onRowClick(row)}
              ondblclick={() => startRename(row)}
            >{row.label}</button>
          {/if}
          {#if alertCount(row) > 0}
            <span class="alert-badge">{alertCount(row)}</span>
          {/if}
          <span class="actions">
            <button
              class="close"
              aria-label={t('nav.close')}
              onclick={(e) => { e.stopPropagation(); onClose(row); }}
            >×</button>
          </span>
        {/if}
      </li>
    {/each}
  </ul>
</nav>

<style>
  .navigator { display: flex; flex-direction: column; height: 100%; background: var(--sidebar); color: var(--text); font: 13px var(--ui-font); }
  /* S3.1: SPACES header — flex row with a label and a ＋ button */
  .nav-head { display: flex; align-items: center; gap: 8px; padding: 9px 8px 9px 12px; border-bottom: 1px solid var(--border); }
  .head-label { flex: 1; font-size: 10px; letter-spacing: .14em; color: var(--text-faint, #7c6f64); font-weight: 600; text-transform: uppercase; }
  .head-add { width: 20px; height: 20px; border-radius: 4px; color: var(--text-dim); font-size: 14px; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
  .head-add:hover { color: var(--text); background: color-mix(in srgb, var(--text) 8%, transparent); }
  ul { list-style: none; margin: 0; padding: 0; flex: 1; overflow: auto; }
  li { display: flex; align-items: center; gap: 4px; padding-right: 6px; }
  /* S3.4: active row accent bar — left inset shadow + light accent background (without --active-row) */
  li.active { box-shadow: inset 2px 0 0 0 var(--accent); background: color-mix(in srgb, var(--accent) 9%, transparent); }
  /* S3.4: active tab name — full bright text + bold weight */
  li.active .label { color: var(--text); font-weight: 600; }
  /* S3.4: hover of a non-active row (doesn't override space-row:hover — same specificity, but this one comes later) */
  li:not(.active):hover { background: color-mix(in srgb, var(--text) 5%, transparent); }
  /* S3.4: combined selectors — when dragging over an active row both the accent bar and the drop indicator are visible */
  li.active.drop-before { box-shadow: inset 0 2px 0 0 var(--accent), inset 2px 0 0 0 var(--accent); }
  li.active.drop-after  { box-shadow: inset 0 -2px 0 0 var(--accent), inset 2px 0 0 0 var(--accent); }
  .drop-before { box-shadow: inset 0 2px 0 0 var(--accent); }
  .drop-after { box-shadow: inset 0 -2px 0 0 var(--accent); }
  .drop-into { outline: 1px solid var(--accent); outline-offset: -1px; background: color-mix(in srgb, var(--accent) 15%, transparent); }
  button { background: none; border: none; color: inherit; cursor: pointer; font: inherit; padding: 2px 4px; text-align: left; }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
  /* S3.2: aggregate dot of a collapsed space is slightly smaller (6×6) */
  .status-dot.agg { width: 6px; height: 6px; }
  .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--ui-font); font-size: calc(var(--ui-font-size) * 1px); }
  .label.dim { color: var(--text-dim); }
  /* S3.2: space section name — UPPERCASE via CSS, we don't touch label.raw (rename intact) */
  .space-name { text-transform: uppercase; font-size: 10px; letter-spacing: .12em; color: var(--text-faint, #7c6f64); }
  /* S3.2: tab counter in the space section */
  .tab-count { font-size: 10px; color: var(--text-faint, #7c6f64); flex: none; }
  /* S3.2: hover of the space section */
  li.space-row:hover { background: color-mix(in srgb, var(--text) 5%, transparent); }
  .twisty, .actions { flex-shrink: 0; }
  /* S3.6: hover-reveal of actions — hide via opacity (nodes stay in tab-order, a11y intact) */
  .actions { display: flex; align-items: center; gap: 2px; opacity: 0; pointer-events: none; transition: opacity .12s; }
  /* Show on row hover or when focus is inside the actions block (keyboard navigation) */
  li:hover .actions, li:focus-within .actions { opacity: 1; pointer-events: auto; }
  /* S3.6: hide the counter/aggregate on hover (no room next to the buttons) */
  li:hover .tab-count, li:hover .status-dot.agg { display: none; }
  .twisty { width: 14px; box-sizing: border-box; padding: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; color: var(--text-faint, #7c6f64); flex: none; }
  /* S3.6: action button color — dimmed, hover — primary; close hover — exit color */
  .actions button { color: var(--text-dim); padding: 1px 3px; }
  .actions button:hover { color: var(--text); }
  .close:hover { color: var(--exit); }
  .rename { flex: 1; background: var(--bg); color: var(--text); border: 1px solid var(--border); font: inherit; padding: 1px 3px; }
  /* S3.5: mockup badge sizes 15×15/radius8/9.5px (was 16×16/9/10px) */
  .alert-badge { min-width: 15px; height: 15px; padding: 0 5px; border-radius: 8px; font: 700 9.5px var(--ui-font); display: inline-flex; align-items: center; justify-content: center; background: var(--alert); color: #1d2021; flex-shrink: 0; }
</style>
