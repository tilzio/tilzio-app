<script lang="ts">
  import type { TableWidget } from '../../state/widgets';
  let { w }: { w: TableWidget } = $props();
</script>

<table class="tbl">
  <thead>
    <tr>{#each w.columns as c, i (i)}<th scope="col">{c}</th>{/each}</tr>
  </thead>
  <tbody>
    {#each w.rows as row, ri (ri)}
      <tr>{#each row as cell, ci (ci)}<td>{cell}</td>{/each}</tr>
    {/each}
  </tbody>
</table>

<style>
  .tbl { width: 100%; border-collapse: collapse; font: 11px var(--ui-font); color: var(--text); }
  th { text-align: left; font-weight: 400; color: var(--text-dim); padding: 1px 6px; }
  td { padding: 1px 6px; overflow-wrap: anywhere; }
</style>
