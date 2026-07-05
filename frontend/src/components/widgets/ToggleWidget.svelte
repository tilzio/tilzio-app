<script lang="ts">
  import type { ToggleWidget } from '../../state/widgets';
  let { w, onCommand }: { w: ToggleWidget; onCommand?: (command: string, args?: unknown) => void } = $props();
</script>
<button class="tg" role="switch" aria-checked={w.value} aria-label={w.label} onclick={() => onCommand?.(w.command + ':' + (w.value ? '0' : '1'))}>
  {#if w.label}<span class="lbl">{w.label}</span>{/if}
  <span class="pill" class:on={w.value}><span class="knob"></span></span>
</button>
<style>
  .tg { display: flex; align-items: center; width: 100%; gap: 8px; background: none; border: none; cursor: pointer; padding: 3px 4px; font: 12px var(--ui-font); color: var(--text); }
  .lbl { flex: 1; text-align: left; }
  .pill { width: 34px; height: 19px; border-radius: 10px; padding: 2px; display: flex; justify-content: flex-start; background: var(--border); flex: none; }
  .pill.on { justify-content: flex-end; background: var(--accent); }
  .knob { width: 15px; height: 15px; border-radius: 50%; background: var(--text-dim); }
  .pill.on .knob { background: var(--sidebar); }
</style>
