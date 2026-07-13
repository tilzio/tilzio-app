<script lang="ts">
  import type { PaneNode, Split } from '../state/types';
  import { findLeaf } from '../state/selectors';
  import { MIN_PANE_PX } from '../state/paneGeometry';
  import { computeResizeRatios } from './splitResize';
  import TerminalPane from './TerminalPane.svelte';
  import EditorPane from './EditorPane.svelte';
  import PluginPane from './PluginPane.svelte';
  import Self from './SplitContainer.svelte'; // self-import for recursion (Svelte 5)
  import { paneDropSide, type DropTarget, type Side } from '../state/dropZone';
  import { dragState, setCandidate, endDrag } from '../bridge/dragState.svelte';

  let {
    node,
    activePaneId,
    zoomedPaneId,
    onFocus,
    onSplit,
    onClose,
    onZoom,
    onResize,
    onRename,
    onModeChange,
    onMovePane,
    onSplitAs,
    onSplitOpenFile,
    onOpenFileHere,
    onActivateFile,
    onCloseFile,
    onMakeTerminal,
    onOpenPath,
    onOpenExtensions,
    termFontSize,
  }: {
    node: PaneNode;
    activePaneId: string;
    zoomedPaneId: string | null;
    onFocus: (paneId: string) => void;
    onSplit: (paneId: string, dir: 'h' | 'v') => void;
    onClose: (paneId: string) => void;
    onZoom: (paneId: string) => void;
    onResize: (splitId: string, ratios: number[]) => void;
    onRename: (paneId: string, title: string) => void;
    onModeChange: (paneId: string, mode: import('../state/types').EditorMode) => void;
    onMovePane: (dragId: string, target: DropTarget) => void;
    onSplitAs?: (paneId: string, dir: 'h' | 'v') => void;
    onSplitOpenFile?: (paneId: string, dir: 'h' | 'v') => void;
    onOpenFileHere?: (paneId: string) => void;
    onActivateFile?: (paneId: string, fileId: string) => void;
    onCloseFile?: (paneId: string, fileId: string) => void;
    onMakeTerminal?: (paneId: string) => void;
    onOpenPath?: (path: string, line?: number, col?: number) => void;
    onOpenExtensions?: () => void;
    termFontSize?: number;
  } = $props();

  // A cell is visible if zoom is off, or its subtree contains the zoomed pane.
  function cellVisible(child: PaneNode): boolean {
    return zoomedPaneId === null || findLeaf(child, zoomedPaneId) !== null;
  }

  // Drag state for one divider; pointer is captured on the divider element.
  let drag: { split: Split; index: number; startPos: number; startRatios: number[]; size: number } | null = null;

  function startDrag(e: PointerEvent, split: Split, index: number) {
    const container = (e.currentTarget as HTMLElement).parentElement;
    if (!container) return;
    const horizontal = split.dir === 'v'; // 'v' = side-by-side → drag along X
    drag = {
      split,
      index,
      startPos: horizontal ? e.clientX : e.clientY,
      startRatios: [...split.ratio],
      size: horizontal ? container.clientWidth : container.clientHeight,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onMove(e: PointerEvent) {
    if (!drag || drag.size === 0) return;
    const horizontal = drag.split.dir === 'v';
    const delta = (horizontal ? e.clientX : e.clientY) - drag.startPos;
    const frac = delta / drag.size;
    const minFrac = MIN_PANE_PX / drag.size;
    const ratios = computeResizeRatios(drag.startRatios, drag.index, frac, minFrac);
    onResize(drag.split.id, ratios);
  }

  function endDrag_resize() {
    drag = null;
  }

  // Drop zone by the local point inside the leaf: center → swap, otherwise edge by the wall.
  function leafTarget(e: DragEvent, leafId: string): DropTarget {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const side = paneDropSide(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    return side === 'center' ? { kind: 'swap', leafId } : { kind: 'edge', leafId, side };
  }
  function onLeafDragOver(e: DragEvent, leafId: string) {
    if (dragState.dragId === null) return;
    e.preventDefault();                 // allow drop
    setCandidate(leafTarget(e, leafId));
  }
  function onLeafDrop(e: DragEvent, leafId: string) {
    if (dragState.dragId === null) return;
    e.preventDefault();
    const dragId = dragState.dragId;
    const target = leafTarget(e, leafId);
    endDrag();
    onMovePane(dragId, target);
  }
  // Clear the drop highlight when the drag actually leaves the leaf; without this
  // it lingered after the pointer moved off the pane. dragleave also fires when
  // moving onto a CHILD of the leaf — relatedTarget containment filters that noise.
  // Only this leaf's own candidate is cleared: a late dragleave from leaf A must
  // not clobber the fresh candidate already set on leaf B.
  function onLeafDragLeave(e: DragEvent, leafId: string) {
    if (dragState.dragId === null) return;
    const to = e.relatedTarget as Node | null;
    if (to && (e.currentTarget as HTMLElement).contains(to)) return;
    const c = dragState.candidate;
    if (c && (c.kind === 'swap' || c.kind === 'edge') && c.leafId === leafId) setCandidate(null);
  }

  function onDividerDragOver(e: DragEvent, splitId: string, index: number) {
    if (dragState.dragId === null) return;
    e.preventDefault();
    setCandidate({ kind: 'divider', splitId, index });
  }
  function onDividerDrop(e: DragEvent, splitId: string, index: number) {
    if (dragState.dragId === null) return;
    e.preventDefault();
    const dragId = dragState.dragId;
    endDrag();
    onMovePane(dragId, { kind: 'divider', splitId, index });
  }
  // Highlight class for the leaf: center (swap) or side (edge) of THIS leaf.
  function leafHl(leafId: string): 'center' | Side | null {
    const c = dragState.candidate;
    if (!c) return null;
    if (c.kind === 'swap' && c.leafId === leafId) return 'center';
    if (c.kind === 'edge' && c.leafId === leafId) return c.side;
    return null;
  }
  function dividerHl(splitId: string, index: number): boolean {
    const c = dragState.candidate;
    return c?.kind === 'divider' && c.splitId === splitId && c.index === index;
  }
</script>

{#if node.kind === 'terminal'}
  {@const hl = leafHl(node.id)}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="leaf"
    style:position="relative"
    style:display={zoomedPaneId === null || zoomedPaneId === node.id ? '' : 'none'}
    ondragover={(e) => onLeafDragOver(e, node.id)}
    ondragleave={(e) => onLeafDragLeave(e, node.id)}
    ondrop={(e) => onLeafDrop(e, node.id)}
  >
    <TerminalPane
      paneId={node.id}
      cwd={node.cwd}
      title={node.title}
      active={node.id === activePaneId}
      zoomed={zoomedPaneId === node.id}
      fontSize={termFontSize}
      onFocus={() => onFocus(node.id)}
      onSplit={(dir) => onSplit(node.id, dir)}
      onClose={() => onClose(node.id)}
      onZoom={() => onZoom(node.id)}
      onRename={(t) => onRename(node.id, t)}
      {onOpenPath}
    />
    {#if hl}
      <div
        class="drop-hl"
        class:center={hl === 'center'}
        class:left={hl === 'left'}
        class:right={hl === 'right'}
        class:top={hl === 'top'}
        class:bottom={hl === 'bottom'}
      ></div>
    {/if}
  </div>
{:else if node.kind === 'editor'}
  {@const hl = leafHl(node.id)}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="leaf"
    style:position="relative"
    style:display={zoomedPaneId === null || zoomedPaneId === node.id ? '' : 'none'}
    ondragover={(e) => onLeafDragOver(e, node.id)}
    ondragleave={(e) => onLeafDragLeave(e, node.id)}
    ondrop={(e) => onLeafDrop(e, node.id)}
  >
    <EditorPane
      paneId={node.id}
      files={node.files}
      activeFileId={node.activeFileId}
      active={node.id === activePaneId}
      zoomed={zoomedPaneId === node.id}
      onFocus={() => onFocus(node.id)}
      onSplit={(dir) => onSplit(node.id, dir)}
      onClose={() => onClose(node.id)}
      onZoom={() => onZoom(node.id)}
      onModeChange={(m) => onModeChange(node.id, m)}
      onSplitAs={(dir) => onSplitAs?.(node.id, dir)}
      onSplitOpenFile={(dir) => onSplitOpenFile?.(node.id, dir)}
      onOpenFile={() => onOpenFileHere?.(node.id)}
      onActivateFile={(fid) => onActivateFile?.(node.id, fid)}
      onCloseFile={(fid) => onCloseFile?.(node.id, fid)}
      onMakeTerminal={() => onMakeTerminal?.(node.id)}
    />
    {#if hl}
      <div
        class="drop-hl"
        class:center={hl === 'center'}
        class:left={hl === 'left'}
        class:right={hl === 'right'}
        class:top={hl === 'top'}
        class:bottom={hl === 'bottom'}
      ></div>
    {/if}
  </div>
{:else if node.kind === 'plugin'}
  {@const hl = leafHl(node.id)}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="leaf"
    style:position="relative"
    style:display={zoomedPaneId === null || zoomedPaneId === node.id ? '' : 'none'}
    ondragover={(e) => onLeafDragOver(e, node.id)}
    ondragleave={(e) => onLeafDragLeave(e, node.id)}
    ondrop={(e) => onLeafDrop(e, node.id)}
  >
    <PluginPane
      paneId={node.id}
      pluginId={node.pluginId}
      viewId={node.viewId}
      active={node.id === activePaneId}
      zoomed={zoomedPaneId === node.id}
      onFocus={() => onFocus(node.id)}
      onSplit={(dir) => onSplit(node.id, dir)}
      onClose={() => onClose(node.id)}
      onZoom={() => onZoom(node.id)}
      {onOpenExtensions}
    />
    {#if hl}
      <div class="drop-hl" class:center={hl === 'center'} class:left={hl === 'left'} class:right={hl === 'right'} class:top={hl === 'top'} class:bottom={hl === 'bottom'}></div>
    {/if}
  </div>
{:else}
  <div class="split" class:vertical={node.dir === 'v'} class:horizontal={node.dir === 'h'}>
    {#each node.children as child, i (child.id)}
      <div class="cell" style:flex-grow={zoomedPaneId === null ? node.ratio[i] : 1} style:display={cellVisible(child) ? '' : 'none'}>
        <Self
          node={child}
          {activePaneId}
          {zoomedPaneId}
          {onFocus}
          {onSplit}
          {onClose}
          {onZoom}
          {onResize}
          {onRename}
          {onModeChange}
          {onMovePane}
          {onSplitAs}
          {onSplitOpenFile}
          {onOpenFileHere}
          {onActivateFile}
          {onCloseFile}
          {onMakeTerminal}
          {onOpenPath}
          {onOpenExtensions}
          {termFontSize}
        />
      </div>
      {#if i < node.children.length - 1}
        <div
          class="divider"
          class:v={node.dir === 'v'}
          class:h={node.dir === 'h'}
          class:draghint={dividerHl(node.id, i + 1)}
          style:display={zoomedPaneId === null ? '' : 'none'}
          role="separator"
          onpointerdown={(e) => startDrag(e, node as Split, i)}
          onpointermove={onMove}
          onpointerup={endDrag_resize}
          onpointercancel={endDrag_resize}
          ondragover={(e) => onDividerDragOver(e, node.id, i + 1)}
          ondrop={(e) => onDividerDrop(e, node.id, i + 1)}
        ></div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .leaf { width: 100%; height: 100%; min-width: 0; min-height: 0; }
  .split { display: flex; width: 100%; height: 100%; }
  /* Panes never shrink below 160px along the split axis (keep in sync with
     MIN_PANE_PX). When they no longer fit, the split scrolls along its axis so
     you can reach the off-screen panes. overflow on the cross axis stays hidden. */
  .split.vertical { flex-direction: row; overflow-x: auto; overflow-y: hidden; }
  .split.horizontal { flex-direction: column; overflow-x: hidden; overflow-y: auto; }
  .cell { flex-basis: 0; overflow: hidden; }
  .split.vertical > .cell { min-width: 160px; }
  .split.horizontal > .cell { min-height: 160px; }
  .divider { flex: 0 0 4px; background: var(--border); }
  .divider:hover { background: var(--accent); }
  .divider.v { cursor: col-resize; }
  .divider.h { cursor: row-resize; }
  /* Drop-zone highlight — over the content, but does NOT intercept events
     (the leaf itself catches the drop). pointer-events:none is critical. */
  .drop-hl { position: absolute; pointer-events: none; z-index: 3; background: color-mix(in srgb, var(--accent) 28%, transparent); border: 1px solid var(--accent); box-sizing: border-box; }
  .drop-hl.center { inset: 12%; }
  .drop-hl.left   { left: 0; top: 0; bottom: 0; width: 45%; }
  .drop-hl.right  { right: 0; top: 0; bottom: 0; width: 45%; }
  .drop-hl.top    { left: 0; right: 0; top: 0; height: 45%; }
  .drop-hl.bottom { left: 0; right: 0; bottom: 0; height: 45%; }
  .divider.draghint { background: var(--accent); }
</style>
