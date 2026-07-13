<script lang="ts">
  import { beginDrag, endDrag } from '../bridge/dragState.svelte';
  import type { EditorMode } from '../state/types';
  import SplitMenu from './SplitMenu.svelte';
  import { t } from '../i18n/index.svelte';

  let {
    paneId, // drag-handle id for pane DnD (passed to beginDrag on dragstart)
    title,
    cwd = '',
    active = false,
    alerted = false,
    exited = false,
    zoomed = false,
    dirty = false,
    shellTag = '',
    mode = 'source',
    mdViews = false,
    canSplitV = true,
    canSplitH = true,
    onSplit,
    onSplitAs,
    onSplitOpenFile,
    onZoom,
    onClose,
    onRename,
    onModeChange,
    fileTabs,
    onActivateFile,
    onCloseFile,
    onAddFile,
    onRestart,
  }: {
    paneId: string;
    title?: string;
    cwd?: string;
    active?: boolean;
    alerted?: boolean;
    exited?: boolean;
    zoomed?: boolean;
    dirty?: boolean;
    shellTag?: string;
    mode?: EditorMode;
    mdViews?: boolean;
    canSplitV?: boolean;
    canSplitH?: boolean;
    onSplit?: (dir: 'h' | 'v') => void;
    onSplitAs?: (dir: 'h' | 'v') => void;
    onSplitOpenFile?: (dir: 'h' | 'v') => void;
    onZoom?: () => void;
    onClose?: () => void;
    onRename?: (title: string) => void;
    onModeChange?: (mode: EditorMode) => void;
    fileTabs?: { fileId: string; name: string; dirty: boolean; active: boolean }[];
    onActivateFile?: (fileId: string) => void;
    onCloseFile?: (fileId: string) => void;
    onAddFile?: () => void;
    onRestart?: () => void;
  } = $props();

  let menuFor = $state<null | 'v' | 'h'>(null);
  // $state: bind:this inside {#if} re-assigns after the initial render (Svelte
  // warns non_reactive_update otherwise). Only read inside the event handler.
  let menuEl = $state<HTMLElement | undefined>(undefined);

  // Close the SplitMenu on a pointerdown outside it (same pattern as
  // GridConsolesButton): capture-phase window listener, active only while open.
  function onWindowDown(e: PointerEvent) {
    if (menuEl && !menuEl.contains(e.target as Node)) menuFor = null;
  }
  $effect(() => {
    if (menuFor === null) return;
    window.addEventListener('pointerdown', onWindowDown, true);
    return () => window.removeEventListener('pointerdown', onWindowDown, true);
  });

  // Display: explicit user title, else the cwd, else a generic label.
  const displayName = $derived(title ?? (cwd || 'shell'));

  let editing = $state(false);
  let value = $state('');

  function startEdit() {
    if (!onRename) return; // the editor doesn't pass onRename → the name isn't editable
    editing = true;
    value = displayName;
  }
  // Guarded so Enter (which clears `editing`) + the subsequent blur commit once.
  function commit() {
    if (!editing) return;
    const v = value.trim();
    if (v) onRename?.(v);
    editing = false;
  }
  function stop(fn?: () => void) {
    return (e: Event) => {
      e.stopPropagation();
      fn?.();
    };
  }
  function autofocus(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  function onHeaderDragStart(e: DragEvent) {
    const t = e.target as HTMLElement;
    // In WebKit dragstart.target is the draggable element itself (the header), not a nested button,
    // so closest('.tools') is best-effort; editing mode is reliably suppressed by draggable={!editing}.
    if (editing || t.closest('.tools') || t.closest('.strip')) { e.preventDefault(); return; } // buttons/strip/editing — don't drag
    beginDrag(paneId);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; // «move» cursor
  }
</script>

<div
  class="header"
  class:active
  class:alerted
  class:editing={editing}
  role="group"
  draggable={!editing}
  ondragstart={onHeaderDragStart}
  ondragend={() => endDrag()}
>
  <!-- status dot: idle/active/alerted/exited — the CSS rule order sets the priority exited>alerted>active>idle -->
  <span class="status-dot" class:active class:alerted class:exited></span>
  {#if fileTabs !== undefined}
    <div class="strip">
      {#each fileTabs as tab (tab.fileId)}
        <div
          class="ftab"
          class:on={tab.active}
          role="tab"
          tabindex="0"
          aria-selected={tab.active}
          onclick={stop(() => onActivateFile?.(tab.fileId))}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onActivateFile?.(tab.fileId); } }}
        >
          {#if tab.dirty}<span class="dot" title={t('header.unsaved')}></span>{/if}
          <span class="fn">{tab.name}</span>
          <button
            class="closebtn"
            aria-label={t('header.closeFile', { name: tab.name })}
            onclick={stop(() => onCloseFile?.(tab.fileId))}
            type="button"
          >✕</button>
        </div>
      {/each}
    </div>
    <button class="plus" aria-label={t('header.openFile')} onclick={stop(() => onAddFile?.())} type="button">+</button>
  {:else if editing}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="rename"
      bind:value
      use:autofocus
      onkeydown={(e) => {
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') editing = false;
      }}
      onblur={commit}
    />
  {:else}
    <span class="name" role="button" tabindex="-1" ondblclick={startEdit}>
      {#if dirty}<span class="dot" title={t('header.unsaved')}></span>{/if} {displayName}
    </span>
  {/if}
  <!-- active process tag on the right (foreground/fallback shell basename); empty → don't render -->
  {#if shellTag}<span class="shell-tag">{shellTag}</span>{/if}
  <span class="tools">
    {#if mdViews && onModeChange}
      <span class="seg" role="group" aria-label={t('header.markdownView')}>
        <button class="segbtn" class:on={mode === 'source'} aria-label={t('header.sourceView')} aria-pressed={mode === 'source'} title={t('header.source')} onclick={stop(() => onModeChange?.('source'))}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="8 7 3 12 8 17"/><polyline points="16 7 21 12 16 17"/></svg>
        </button>
        <button class="segbtn" class:on={mode === 'split'} aria-label={t('header.splitView')} aria-pressed={mode === 'split'} title={t('header.split')} onclick={stop(() => onModeChange?.('split'))}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1.5"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
        </button>
        <button class="segbtn" class:on={mode === 'preview'} aria-label={t('header.previewView')} aria-pressed={mode === 'preview'} title={t('header.preview')} onclick={stop(() => onModeChange?.('preview'))}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="2.6"/></svg>
        </button>
      </span>
    {/if}
    {#if exited}
      <!-- shell restart button — appears only when the pane has exited (exited=true) -->
      <button aria-label={t('header.restartShell')} title={t('header.restart')} onclick={stop(() => onRestart?.())}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><polyline points="20 5 20 11 14 11"/></svg>
      </button>
    {/if}
    {#if canSplitV && !exited && !zoomed}<button aria-label={t('header.splitRight')} title={t('header.splitRightTitle')} onclick={stop(() => onSplit?.('v'))} oncontextmenu={(e) => { e.preventDefault(); e.stopPropagation(); menuFor = 'v'; }}>
        <!-- split vertically: frame + vertical line in the center -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/><line x1="12" y1="4.5" x2="12" y2="19.5"/></svg>
      </button>{/if}
    {#if canSplitH && !exited && !zoomed}<button aria-label={t('header.splitDown')} title={t('header.splitDownTitle')} onclick={stop(() => onSplit?.('h'))} oncontextmenu={(e) => { e.preventDefault(); e.stopPropagation(); menuFor = 'h'; }}>
        <!-- split horizontally: frame + horizontal line in the center -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/><line x1="3.5" y1="12" x2="20.5" y2="12"/></svg>
      </button>{/if}
    <!-- zoom: four corner arrows (static, doesn't toggle by zoomed) -->
    <button aria-label={t('header.zoom')} title={t('header.zoomTitle')} onclick={stop(() => onZoom?.())}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 9 4 4 9 4"/><polyline points="20 15 20 20 15 20"/><polyline points="15 4 20 4 20 9"/><polyline points="9 20 4 20 4 15"/></svg>
    </button>
    <!-- close pane: ✕ cross SVG. .close-btn — stable hook for the :hover rule
         (the selector must not depend on the localized aria-label). -->
    <button class="close-btn" aria-label={t('header.closePane')} title={t('header.close')} onclick={stop(() => onClose?.())}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6.5" y1="6.5" x2="17.5" y2="17.5"/><line x1="17.5" y1="6.5" x2="6.5" y2="17.5"/></svg>
    </button>
    {#if menuFor !== null}
      <div aria-label={t('header.splitMenu')} bind:this={menuEl}>
        <SplitMenu
          onTerminal={() => onSplit?.(menuFor!)}
          onEditor={() => onSplitAs?.(menuFor!)}
          onOpenFile={() => onSplitOpenFile?.(menuFor!)}
          onClose={() => menuFor = null}
        />
      </div>
    {/if}
  </span>
</div>

<style>
  /* z-index:2 keeps the header (and its buttons) above the exit-overlay (z-index:1)
     and the terminal host (z-index:0) inside TerminalPane's stacking context. */
  .header {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 8px;
    height: var(--pane-header-h);
    padding: 0 9px;
    background: var(--bg-elevated);
    color: var(--text-dim);
    font: 11px var(--ui-font);
    user-select: none;
    cursor: grab;
  }
  /* active header — only toolbar highlight, amber/header-active removed (S4.4) */
  .header.alerted { background: color-mix(in srgb, var(--alert) 28%, var(--bg-elevated)); }
  .header.active .name { color: var(--text); font-weight: 600; }
  .header.alerted .name { color: var(--alert); font-weight: 600; }
  .header:active { cursor: grabbing; }
  .header.editing, .header.editing:active { cursor: text; }
  /* pane name: fixed size 11.5px (S4.4), color/weight change by state via .header.active/.header.alerted */
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--ui-font); font-size: 11.5px; font-weight: 400; color: var(--text-dim); }
  /* status dot: idle — base color; priority: active → alerted → exited (the last rule wins) */
  .status-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--idle); }
  .status-dot.active { background: var(--accent); box-shadow: 0 0 6px rgba(254, 128, 25, 0.7); }
  .status-dot.alerted { background: var(--alert); box-shadow: 0 0 6px rgba(43, 217, 196, 0.7); }
  .status-dot.exited { background: var(--exit); box-shadow: none; }
  .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); flex-shrink: 0; margin-left: 2px; vertical-align: middle; }
  /* process tag to the right of the name — small monospaced chip (S4.5) */
  .shell-tag { font-size: 9px; color: var(--text-faint); border: 1px solid var(--border); border-radius: 3px; padding: 0 4px; flex-shrink: 0; line-height: 14px; }
  .seg { display: flex; align-items: center; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; margin-right: 2px; }
  .segbtn { background: none; border: none; color: var(--text-dim); cursor: pointer; display: flex; align-items: center; justify-content: center; height: 18px; padding: 0 7px; }
  .segbtn svg { width: 13px; height: 13px; display: block; }
  .segbtn + .segbtn { border-left: 1px solid var(--border); }
  .segbtn:hover { color: var(--text); }
  .segbtn.on { background: color-mix(in srgb, var(--accent) 26%, transparent); color: var(--accent); }
  .rename { flex: 1; background: var(--bg); color: var(--text); border: 1px solid var(--border); font: inherit; padding: 1px 4px; }
  .tools { display: flex; gap: 1px; flex-shrink: 0; opacity: 0.6; transition: opacity 0.1s; position: relative; }
  .header:hover .tools, .header.active .tools { opacity: 0.85; }
  .tools button { background: none; border: none; color: inherit; cursor: pointer; font-size: 12px; line-height: 1; padding: 2px 2px; display: flex; align-items: center; justify-content: center; }
  .tools button svg { width: 14px; height: 14px; display: block; }
  .tools button:hover { color: var(--text); }
  /* close button on hover — exit color (stable class, survives label localization) */
  .tools button.close-btn:hover { color: var(--exit); }
  /* file tab strip — S4.6: gap 3px, inactive without background, active — outline pill */
  .strip { flex: 1; min-width: 0; overflow-x: auto; overflow-y: hidden; display: flex; align-items: center; gap: 3px; scrollbar-width: none; }
  .strip::-webkit-scrollbar { display: none; }
  .ftab { display: flex; align-items: center; gap: 5px; padding: 0 6px 0 9px; border-radius: 5px;
    color: var(--text-dim); white-space: nowrap; cursor: pointer;
    height: 19px; font-size: 11px; border: none; font: inherit; }
  .ftab:hover { color: var(--text); }
  .ftab.on { background: var(--bg); box-shadow: inset 0 0 0 1px var(--border-2); color: var(--text); }
  .ftab .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
  .ftab .fn { overflow: hidden; text-overflow: ellipsis; max-width: 120px; }
  .closebtn { background: none; border: none; color: inherit; cursor: pointer; font-size: 11px; line-height: 1;
    padding: 1px 2px; border-radius: 3px; opacity: 0.75; }
  .closebtn:hover { opacity: 1; background: #ffffff20; }
  .plus { background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 14px;
    display: flex; align-items: center; justify-content: center; width: 20px; height: 18px;
    border-radius: 4px; flex-shrink: 0; padding: 0; }
  .plus:hover { color: var(--text); background: #ffffff10; }
</style>
