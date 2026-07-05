<script lang="ts">
  // Thin drag handle on the right edge of the sidebar. Pointer logic modeled on
  // SplitContainer: capture the pointer on the element, move, release. Outward
  // only two callbacks — the current width (px) and reset (dblclick).
  let { onResize, onReset, offset = 0 }: { onResize: (px: number) => void; onReset: () => void; offset?: number } = $props();

  let dragging = $state(false);

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    // clientX = pointer position from the WINDOW's left edge. On the left there is now the Activity Bar
    // (offset), so the sidebar width = clientX − offset. offset=0 → previous behavior.
    onResize(e.clientX - offset);
  }
  function onPointerUp(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }
</script>

<div
  class="resizer"
  class:dragging
  role="separator"
  aria-orientation="vertical"
  aria-label="resize sidebar"
  tabindex="-1"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  ondblclick={() => onReset()}
></div>

<style>
  .resizer {
    width: 100%;
    height: 100%;
    cursor: col-resize;
    background: transparent;
    transition: background 0.1s;
  }
  .resizer:hover,
  .resizer.dragging {
    background: var(--accent);
  }
</style>
