<script lang="ts">
  // Thin drag handle on the LEFT edge of the right column (③). Mirror of SidebarResizer,
  // but the width is measured from the window's right edge: innerWidth − clientX.
  let { onResize, onReset }: { onResize: (px: number) => void; onReset: () => void } = $props();

  let dragging = $state(false);

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    onResize(window.innerWidth - e.clientX);
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
  aria-label="resize right panel"
  tabindex="-1"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  ondblclick={() => onReset()}
></div>

<style>
  .resizer { width: 100%; height: 100%; cursor: col-resize; background: transparent; transition: background 0.1s; }
  .resizer:hover, .resizer.dragging { background: var(--accent); }
</style>
