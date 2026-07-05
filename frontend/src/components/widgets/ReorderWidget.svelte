<script lang="ts">
  import type { ReorderWidget } from '../../state/widgets';
  import WidgetRenderer from '../WidgetRenderer.svelte';
  import { reorderIds } from '../../state/reorder';
  import { widgetDrag, beginWidgetDrag, setWidgetCandidate, endWidgetDrag } from '../../bridge/widgetDragState.svelte';
  let { w, onCommand }: { w: ReorderWidget; onCommand?: (command: string, args?: unknown) => void } = $props();

  const ids = $derived(w.items.map((it) => it.id));
  const canDrag = $derived(w.items.length > 1);

  function posOf(e: DragEvent): 'before' | 'after' {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return (e.clientY - r.top) < r.height / 2 ? 'before' : 'after';
  }
  function onStart(e: DragEvent, id: string) {
    const t = e.target as HTMLElement;
    if (!canDrag || t.closest('button,input,a,select,textarea')) { e.preventDefault(); return; }
    beginWidgetDrag(id, w.command);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }
  function onOver(e: DragEvent, id: string) {
    if (widgetDrag.dragId === null || widgetDrag.command !== w.command) return;
    e.preventDefault();
    setWidgetCandidate({ id, pos: posOf(e) });
  }
  function onDrop(e: DragEvent, id: string) {
    if (widgetDrag.dragId === null || widgetDrag.command !== w.command) return;
    e.preventDefault();
    const next = reorderIds(ids, widgetDrag.dragId, id, posOf(e));
    const cmd = w.command;
    const changed = next.join(',') !== ids.join(',');
    endWidgetDrag();
    if (changed) onCommand?.(`${cmd}:${next.join(',')}`);
  }
  function hl(id: string): '' | 'before' | 'after' {
    const c = widgetDrag.candidate;
    return (widgetDrag.dragId !== null && widgetDrag.command === w.command && c && c.id === id) ? c.pos : '';
  }
</script>

<div class="reorder" class:card={w.card} role="list">
  {#each w.items as it (it.id)}
    <div class="item" class:dragging={widgetDrag.dragId === it.id} class:alert={it.alert}
      class:hlbefore={hl(it.id) === 'before'} class:hlafter={hl(it.id) === 'after'}
      draggable={canDrag} role="listitem"
      ondragstart={(e) => onStart(e, it.id)} ondragend={() => endWidgetDrag()}
      ondragover={(e) => onOver(e, it.id)} ondrop={(e) => onDrop(e, it.id)}>
      {#if canDrag && !w.card}<span class="grip" aria-hidden="true"></span>{/if}
      <div class="content">
        {#if it.widgets}
          <WidgetRenderer widgets={it.widgets} {onCommand} />
        {:else}
          <span class="row">{#if it.icon}<span class="ic">{it.icon}</span>{/if}{it.text ?? ''}</span>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .reorder { display: flex; flex-direction: column; gap: 4px; }
  /* card variant: each item is a separate card block (border + background + padding) */
  .reorder.card { gap: 7px; }
  .reorder.card > .item { border: 1px solid var(--border); border-radius: var(--radius); padding: 7px 9px; background: color-mix(in srgb, var(--text) 4%, transparent); }
  .reorder.card > .item.dragging { box-shadow: 0 6px 16px #0006; }
  .reorder.card > .item.alert { border-color: var(--red); animation: uwPulse 1.8s ease-in-out infinite; }
  .item { position: relative; display: flex; align-items: flex-start; gap: 6px; border-radius: var(--radius); }
  /* grip mode (not card): single row → vertically center the grip with the content (toggle/chip) */
  .reorder:not(.card) > .item { align-items: center; }
  .item[draggable='true'] { cursor: grab; }
  .item.dragging { opacity: 0.5; }
  .item.hlbefore::before, .item.hlafter::after { content: ''; position: absolute; left: 0; right: 0; height: 0; border-top: 2px solid var(--accent); box-shadow: 0 0 6px var(--accent); }
  .item.hlbefore::before { top: -3px; }
  .item.hlafter::after { bottom: -3px; }
  /* the grip is drawn as dots (2×3) via box-shadow — independent of font metrics,
     centers on the row precisely (unlike the ⠿ glyph, which sits high). */
  .grip { flex-shrink: 0; align-self: center; cursor: grab; user-select: none;
    width: 2px; height: 2px; border-radius: 50%; margin: 0 4px 0 1px;
    background: currentColor; color: var(--text-dim);
    box-shadow: 4px 0, 0 -5px, 4px -5px, 0 5px, 4px 5px; }
  .content { flex: 1; min-width: 0; }
  .row { display: flex; align-items: center; gap: 6px; font: 12px var(--ui-font); color: var(--text); padding: 2px 4px; }
  .ic { flex-shrink: 0; }
</style>
