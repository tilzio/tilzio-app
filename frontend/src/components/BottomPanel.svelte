<script lang="ts">
  // Tall dock area at the bottom (④). Presentational: height comes from above,
  // resize/reset are emitted via callbacks. The handle is on the TOP edge (pointer-capture
  // modeled on SidebarResizer). The content is rendered by PluginPanelArea (SP-4).
  import { STATUS_BAR_HEIGHT } from '../state/bottomPanel';
  import PluginPanelArea from './PluginPanelArea.svelte';
  import type { ResolvedPanel } from '../state/pluginSlots';
  import { t } from '../i18n/index.svelte';
  let { height = 200, onResize, onReset, panels = [], activeId = null, onSelectTab, onCommand }: {
    height?: number;
    onResize?: (px: number) => void;
    onReset?: () => void;
    panels?: ResolvedPanel[];
    activeId?: string | null;
    onSelectTab?: (id: string) => void;
    onCommand?: (pluginId: string, command: string, args?: unknown) => void;
  } = $props();

  let dragging = $state(false);

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    // The panel's bottom is pinned to the bottom of grid row 1 = window bottom − status bar. Height =
    // (panel bottom) − pointer Y. Fragile with left/bottom insets — see spec §4.
    onResize?.(window.innerHeight - STATUS_BAR_HEIGHT - e.clientY);
  }
  function onPointerUp(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }
</script>

<section class="bottom-panel" style:height="{height}px">
  <div
    class="resize-handle"
    class:dragging
    role="separator"
    aria-orientation="horizontal"
    aria-label={t('status.resizeBottomPanel')}
    tabindex="-1"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    ondblclick={() => onReset?.()}
  ></div>
  <div class="area">
    <PluginPanelArea {panels} {activeId} onSelectTab={(id) => onSelectTab?.(id)} onCommand={(pid, c, a) => onCommand?.(pid, c, a)} />
  </div>
</section>

<style>
  .bottom-panel {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--bg-elevated);
    border-top: 1px solid var(--border);
  }
  .resize-handle {
    height: 5px;
    flex: 0 0 auto;
    cursor: row-resize;
    background: transparent;
    transition: background 0.1s;
  }
  .resize-handle:hover,
  .resize-handle.dragging { background: var(--accent); }
  .area { flex: 1; min-height: 0; display: flex; flex-direction: column; }
</style>
