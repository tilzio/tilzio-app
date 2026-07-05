<script lang="ts">
  // Hint overlay while dragging a file from Finder (#2). Purely visual:
  // pointer-events:none — the real drop is caught by the native Wails layer (coordinates for
  // §5.5 routing arrive via editor:files-dropped). There are no coordinates during the drag
  // → we can't highlight a specific pane, so we show a general hint over the main area.
  import { t } from '../i18n/index.svelte';

  let { show = false }: { show?: boolean } = $props();
</script>

{#if show}
  <div class="finder-drop" role="presentation" style="pointer-events:none">
    <div class="card">
      <div class="ico">📄↓</div>
      <div class="t">{t('finder.title')}</div>
      <div class="s">{t('finder.subtitle')}</div>
    </div>
  </div>
{/if}

<style>
  /* Soft dimming (the content shows through). pointer-events:none — we don't intercept
     the native drop or the panes' internal DnD. */
  .finder-drop {
    position: absolute; inset: 0; z-index: 50; pointer-events: none;
    display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, #000 55%, transparent);
  }
  .card {
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    padding: 22px 30px; max-width: 320px; text-align: center;
    background: var(--bg-elevated); border: 2px dashed var(--accent);
    border-radius: var(--radius-lg); box-shadow: 0 6px 24px #000a;
  }
  .ico { font-size: 30px; line-height: 1; }
  .t { font: 700 13px var(--ui-font, ui-monospace, monospace); color: var(--text); }
  .s { font: 11px var(--ui-font, ui-monospace, monospace); color: var(--text-dim); line-height: 1.5; }
</style>
