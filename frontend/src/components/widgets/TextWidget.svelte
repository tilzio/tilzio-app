<script lang="ts">
  import type { TextWidget } from '../../state/widgets';
  import { toneColor } from '../../state/widgets';
  let { w }: { w: TextWidget } = $props();
</script>

<div class="text" class:kv={!!w.label}>
  {#if w.label}<span class="label">{w.label}</span>{/if}
  <span class="value" style:color={toneColor(w.tone)}>{w.text}</span>
</div>

<style>
  .text { padding: 2px 0; font: 12px var(--ui-font); }
  /* "key/value": the label is a fixed-width column, the value right after it on
     the left. With the panel's monospace font, values line up in an even column
     even with labels of different widths (5h/Weekly/Sonnet wk/Today/Month). A lone
     text (without label) stays a regular left-aligned row. */
  .text.kv { display: flex; align-items: baseline; gap: 8px; }
  .label { color: var(--text-dim); margin-right: 6px; }
  .text.kv .label { min-width: 9ch; flex: none; margin-right: 0; }
</style>
