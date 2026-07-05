<script lang="ts">
  import type { SegmentedWidget } from '../../state/widgets';
  let { w, onCommand }: { w: SegmentedWidget; onCommand?: (command: string, args?: unknown) => void } = $props();
</script>
<div class="sg">
  {#if w.label}<span class="lbl">{w.label}</span>{/if}
  <div class="seg" role="group" aria-label={w.label}>
    {#each w.options as o (o.value)}
      <button class="opt" class:on={o.value === w.value} aria-pressed={o.value === w.value} onclick={() => onCommand?.(w.command + ':' + o.value)}>{o.label}</button>
    {/each}
  </div>
</div>
<style>
  .sg { display: flex; align-items: center; gap: 8px; padding: 3px 4px; font: 12px var(--ui-font); color: var(--text); }
  .lbl { flex: 1; }
  .seg { display: inline-flex; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; padding: 2px; }
  .opt { background: none; border: none; cursor: pointer; font: 11px var(--ui-font); color: var(--text-dim); padding: 3px 10px; border-radius: 3px; }
  .opt.on { background: var(--accent); color: var(--sidebar); }
</style>
