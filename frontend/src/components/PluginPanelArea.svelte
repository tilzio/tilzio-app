<script lang="ts">
  // Shared render area for plugin panels (④ and ③): a row of tabs (if there are >1 panels)
  // + the body of the active panel via WidgetRenderer. Presentational.
  import type { ResolvedPanel } from '../state/pluginSlots';
  import WidgetRenderer from './WidgetRenderer.svelte';
  import { t } from '../i18n/index.svelte';
  let { panels, activeId, onSelectTab, onCommand }: {
    panels: ResolvedPanel[];
    activeId: string | null;
    onSelectTab: (id: string) => void;
    onCommand: (pluginId: string, command: string, args?: unknown) => void;
  } = $props();

  const active = $derived(panels.find((p) => p.id === activeId) ?? panels[0] ?? null);
</script>

{#if panels.length === 0}
  <div class="empty">{t('plugin.noPanels')}</div>
{:else}
  {#if panels.length > 1}
    <div class="tabs">
      {#each panels as p (p.id)}
        <button class="tab" class:active={active?.id === p.id} title={p.title} onclick={() => onSelectTab(p.id)}>{p.title}</button>
      {/each}
    </div>
  {/if}
  {#if active?.header}
    <div class="panel-hdr">
      {#if active.header.icon}<span class="hdr-ico">{active.header.icon}</span>{/if}
      <span class="hdr-title">{active.header.title ?? ''}</span>
      <span class="hdr-actions">
        {#each active.header.actions as a, ai (ai)}
          <button class="hdr-action" title={a.command} onclick={() => onCommand(active.pluginId, a.command, a.args)}>{a.icon}</button>
        {/each}
      </span>
    </div>
  {/if}
  {#if active}
    <div class="body">
      <WidgetRenderer widgets={active.widgets} onCommand={(command, args) => onCommand(active.pluginId, command, args)} />
    </div>
  {/if}
{/if}

<style>
  .empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-dim); font-style: italic; font-size: 12px; }
  .tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .tab { background: none; border: none; color: var(--text-dim); padding: 3px 10px; font: 10px var(--ui-font); letter-spacing: .06em; text-transform: uppercase; cursor: pointer; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tab.active { color: var(--text); border-bottom: 2px solid var(--accent); }
  /* Tab hover — conservative default (no background, only color) */
  .tab:hover { color: var(--text); }
  .body { flex: 1; min-height: 0; overflow: auto; }
  .panel-hdr { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 11px; border-bottom: 1px solid var(--border); flex-shrink: 0; color: var(--text-dim); font: 11px var(--ui-font); letter-spacing: .12em; }
  .hdr-title { flex: 1; color: var(--text); text-transform: uppercase; }
  .hdr-actions { display: flex; gap: 6px; }
  .hdr-action { background: none; border: none; color: var(--text-dim); cursor: pointer; font: 14px var(--ui-font); padding: 0 2px; }
  .hdr-action:hover { color: var(--text); }
</style>
