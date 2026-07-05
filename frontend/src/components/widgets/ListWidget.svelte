<script lang="ts">
  import type { ListWidget } from '../../state/widgets';
  import { toneColor } from '../../state/widgets';
  let { w, onCommand }: { w: ListWidget; onCommand?: (command: string, args?: unknown) => void } = $props();
</script>

<div class="list">
  {#each w.items as it, i (i)}
    {#if it.command}
      <button class="row clickable" onclick={() => onCommand?.(it.command as string, it.args)}>
        {#if it.icon}<span class="icon" style:color={toneColor(it.tone)}>{it.icon}</span>{/if}
        <span class="txt">{it.text}</span>
        {#if it.badge}<span class="b">{it.badge}</span>{/if}
        <span class="chev">›</span>
      </button>
    {:else}
      <div class="row">
        {#if it.icon}<span class="icon" style:color={toneColor(it.tone)}>{it.icon}</span>{/if}
        <span class="txt">{it.text}</span>
        {#if it.badge}<span class="b">{it.badge}</span>{/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .list { display: flex; flex-direction: column; }
  .row { display: flex; align-items: center; gap: 6px; padding: 2px 4px; font: 12px var(--ui-font); color: var(--text); background: none; border: none; text-align: left; width: 100%; }
  .clickable { cursor: pointer; }
  .clickable:hover { background: var(--active-row); }
  .txt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .icon { flex-shrink: 0; }
  .b { flex-shrink: 0; background: var(--border); color: var(--text); border-radius: 9px; padding: 0 6px; font-size: 10px; }
  .chev { color: var(--text-dim); flex-shrink: 0; }
</style>
