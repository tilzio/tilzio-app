<script lang="ts">
  import { dragState, setCandidate, endDrag } from '../bridge/dragState.svelte';
  import type { DropTarget, Side } from '../state/dropZone';

  // Perimeter of the tab area: a drop against the outer wall → outer (spanning the whole layout side).
  // The strips are visible only during a drag. The dragged identity comes from dragState.
  let { onMovePane }: { onMovePane: (dragId: string, target: DropTarget) => void } = $props();

  const SIDES: Side[] = ['left', 'right', 'top', 'bottom'];

  function over(e: DragEvent, side: Side) {
    if (dragState.dragId === null) return;
    e.preventDefault();           // allow drop
    setCandidate({ kind: 'outer', side });
  }
  function drop(e: DragEvent, side: Side) {
    if (dragState.dragId === null) return;
    e.preventDefault();
    const dragId = dragState.dragId;
    endDrag();
    onMovePane(dragId, { kind: 'outer', side });
  }
  function hl(side: Side): boolean {
    const c = dragState.candidate;
    return c?.kind === 'outer' && c.side === side;
  }
</script>

{#if dragState.dragId !== null}
  <div class="perimeter">
    {#each SIDES as side (side)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="edge-strip {side}"
        class:draghint={hl(side)}
        ondragover={(e) => over(e, side)}
        ondrop={(e) => drop(e, side)}
      ></div>
    {/each}
  </div>
{/if}

<style>
  /* The container doesn't catch events; only the strips themselves do (pointer-events:auto). */
  .perimeter { position: absolute; inset: 0; pointer-events: none; z-index: 4; }
  .edge-strip { position: absolute; pointer-events: auto; }
  /* The strips are inset from the top by the header height so they don't overlap the header
     handles of the top panes (otherwise they can't be dragged — the drag reads immediately
     as outer-top). Thinner (12px). */
  .edge-strip.left   { left: 0; top: var(--pane-header-h); bottom: 0; width: 12px; }
  .edge-strip.right  { right: 0; top: var(--pane-header-h); bottom: 0; width: 12px; }
  .edge-strip.top    { top: var(--pane-header-h); left: 0; right: 0; height: 12px; }
  .edge-strip.bottom { bottom: 0; left: 0; right: 0; height: 12px; }
  .edge-strip.draghint { background: color-mix(in srgb, var(--accent) 40%, transparent); }
</style>
