<script lang="ts">
  import GridConsolesButton from './GridConsolesButton.svelte';
  import type { ResolvedBreadcrumbItem } from '../state/pluginSlots';
  import { toneColor } from '../state/widgets';
  import { t } from '../i18n/index.svelte';
  let { parts, onAddTab, onAddConsoles, pluginItems = [], onPluginCommand, rightAreaOpen = false, onToggleRightArea }: {
    parts: string[];
    onAddTab?: () => void;
    onAddConsoles?: (cols: number, rows: number) => void;
    pluginItems?: ResolvedBreadcrumbItem[];
    onPluginCommand?: (pluginId: string, command: string) => void;
    rightAreaOpen?: boolean;
    onToggleRightArea?: () => void;
  } = $props();
</script>

<div class="breadcrumb">
  <div class="left">
    <div class="path">
      {#each parts as part, i (i)}
        {#if i > 0}<span class="sep">›</span>{/if}
        <span class="part" class:active={i === parts.length - 1}>{part}</span>
      {/each}
    </div>
  </div>
  <div class="right">
    {#each pluginItems as it (it.pluginId + ':' + it.id)}
      {#if it.command}
        <button class="pi" style:color={it.color ?? toneColor(it.tone)} onclick={() => onPluginCommand?.(it.pluginId, it.command as string)}>{it.icon ? it.icon + ' ' : ''}{it.text}</button>
      {:else}
        <span class="pi" style:color={it.color ?? toneColor(it.tone)}>{it.icon ? it.icon + ' ' : ''}{it.text}</span>
      {/if}
    {/each}
    <button class="right-toggle" class:open={rightAreaOpen} aria-label={t('breadcrumb.toggleRightPanel')} aria-pressed={rightAreaOpen} title={t('breadcrumb.rightPanelTitle')} onclick={() => onToggleRightArea?.()}>◧</button>
    <GridConsolesButton onSubmit={(c, r) => onAddConsoles?.(c, r)} />
    <button class="add-tab" aria-label={t('breadcrumb.addTab')} title={t('breadcrumb.newTab')} onclick={() => onAddTab?.()}>{t('breadcrumb.tabButton')}</button>
  </div>
</div>

<style>
  .breadcrumb { height: 30px; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; background: var(--breadcrumb); color: var(--text-dim); font: 12px var(--ui-font); border-bottom: 1px solid var(--border); }
  .left { display: flex; align-items: center; gap: 8px; }
  .path { display: flex; align-items: center; gap: 6px; }
  .sep { opacity: 0.5; }
  /* active (last) path segment — bright text */
  .part.active { color: var(--text-bright); }
  .add-tab { background: color-mix(in srgb, var(--amber) 10%, transparent); color: var(--amber); border: 1px solid var(--border); border-radius: var(--radius); padding: 2px 8px; font: inherit; cursor: pointer; }
  .add-tab:hover { background: color-mix(in srgb, var(--amber) 18%, transparent); }
  /* tightened gap on the right side per spec S2.3 */
  .right { display: flex; align-items: center; gap: 7px; }
  .pi { background: none; border: none; font: inherit; color: var(--text-dim); cursor: default; padding: 0; white-space: nowrap; }
  button.pi { cursor: pointer; }
  button.pi:hover { color: var(--text); }
  .right-toggle { background: none; border: 1px solid var(--border); color: var(--text-dim); border-radius: var(--radius); padding: 0 6px; font: inherit; cursor: pointer; }
  .right-toggle.open { color: var(--accent); border-color: var(--accent); }
</style>
