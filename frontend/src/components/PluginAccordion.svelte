<script lang="ts">
  import type { ResolvedPanel } from '../state/pluginSlots';
  import WidgetRenderer from './WidgetRenderer.svelte';
  import PluginViewFrame from './PluginViewFrame.svelte';
  import { t } from '../i18n/index.svelte';

  let { panels, collapsed, onToggle, onClose, onCommand }: {
    panels: ResolvedPanel[];
    collapsed: Record<string, boolean>;
    onToggle: (id: string) => void;
    onClose: (id: string) => void;
    onCommand: (pluginId: string, command: string, args?: unknown) => void;
  } = $props();
</script>

{#if panels.length === 0}
  <div class="empty">{t('plugin.noPanels')}</div>
{:else}
  {#each panels as p (p.id)}
    {@const isCollapsed = collapsed[p.id] === true}
    <section class="sec">
      <div class="sechd">
        <button class="cv" aria-label={(isCollapsed ? 'expand ' : 'collapse ') + p.title} onclick={() => onToggle(p.id)}>{isCollapsed ? '▸' : '▾'}</button>
        <span class="ttl">{p.title}</span>
        <button class="x" aria-label={'close ' + p.title} onclick={() => onClose(p.id)}>✕</button>
      </div>
      {#if !isCollapsed}
        <div class="body" class:iframe={p.render === 'iframe'}>
          {#if p.render === 'iframe' && p.entry}
            <PluginViewFrame pluginId={p.pluginId} entry={p.entry} frameId={`panel:right:${p.pluginId}:${p.id}`} title={p.title} />
          {:else}
            <WidgetRenderer widgets={p.widgets} onCommand={(command, args) => onCommand(p.pluginId, command, args)} />
          {/if}
        </div>
      {/if}
    </section>
  {/each}
{/if}

<style>
  .empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-dim); font-style: italic; font-size: 12px; }
  .sec { display: flex; flex-direction: column; border-bottom: 1px solid var(--border); }
  .sechd { display: flex; align-items: center; gap: 7px; padding: 5px 8px 5px 6px; color: var(--text-dim); font: 10px var(--ui-font); letter-spacing: .1em; text-transform: uppercase; }
  .sechd .ttl { flex: 1; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sechd button { background: none; border: none; color: var(--text-dim); cursor: pointer; font: 11px var(--ui-font); padding: 0 2px; }
  .sechd button:hover { color: var(--text); }
  .body { min-height: 0; overflow: auto; }
  /* iframe sections get a fixed height with internal iframe scroll (spec §11). */
  .body.iframe { height: 280px; display: flex; overflow: hidden; }
</style>
