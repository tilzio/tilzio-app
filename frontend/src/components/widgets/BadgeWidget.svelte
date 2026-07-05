<script lang="ts">
  import type { BadgeWidget } from '../../state/widgets';
  import { toneColor } from '../../state/widgets';
  let { w }: { w: BadgeWidget } = $props();
</script>

<div class="badges">
  {#each w.items as it, i (i)}
    <span class="badge" style:background={toneColor(it.tone)}>{it.text}</span>
  {/each}
</div>

<style>
  .badges { display: flex; gap: 6px; flex-wrap: wrap; padding: 2px 0; }
  .badge { color: #1d2021; border-radius: 9px; padding: 0 7px; font: 700 10px var(--ui-font); }
</style>
