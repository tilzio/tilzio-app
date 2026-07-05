<script lang="ts">
  import type { MeterWidget } from '../../state/widgets';
  import { toneColor } from '../../state/widgets';
  let { w }: { w: MeterWidget } = $props();
  const pct = $derived(Math.max(0, Math.min(100, (w.value / (w.max > 0 ? w.max : 100)) * 100)));
  const fill = $derived(w.color ?? (w.tone ? toneColor(w.tone) : 'var(--accent)'));
</script>

<div class="meter">
  {#if w.label}<span class="m-label">{w.label}</span>{:else}<span class="m-label"></span>{/if}
  <span class="m-track"><span class="m-fill" style:width="{pct}%" style:background={fill}></span></span>
  {#if w.text}<span class="m-val">{w.text}</span>{:else}<span class="m-val"></span>{/if}
  {#if w.caption}<span class="m-cap">{w.caption}</span>{/if}
</div>

<style>
  .meter { display: grid; grid-template-columns: 4.5em 1fr 3.2em 4.5em; align-items: center; gap: 6px; font: 11px var(--ui-font); padding: 1px 0; }
  .m-label { color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .m-track { height: 10px; background: rgba(0,0,0,0.28); border: 1px solid var(--border); border-radius: 3px; overflow: hidden; min-width: 24px; }
  .m-fill { display: block; height: 100%; }
  .m-val { color: var(--text); text-align: right; white-space: nowrap; }
  .m-cap { color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
