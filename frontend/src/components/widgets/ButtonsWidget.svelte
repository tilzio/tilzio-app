<script lang="ts">
  import type { ButtonsWidget } from '../../state/widgets';
  let { w, onCommand }: { w: ButtonsWidget; onCommand?: (command: string, args?: unknown) => void } = $props();
</script>

<div class="buttons">
  {#each w.items as it, i (i)}
    <button class="btn" onclick={() => onCommand?.(it.command, it.args)}>{it.text}</button>
  {/each}
</div>

<style>
  .buttons { display: flex; gap: 6px; flex-wrap: wrap; padding: 2px 0; }
  .btn { background: var(--bg-elevated); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius); padding: 2px 10px; font: 12px var(--ui-font); cursor: pointer; }
  .btn:hover { border-color: var(--accent); }
</style>
