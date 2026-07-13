<script lang="ts">
  // Thin bar at the very bottom of the window (grid row 2, full width under the Activity Bar).
  // Presentational: values come from above, the toggle is emitted via a callback.
  import { pluralConsoles } from '../state/selectors';
  import type { ResolvedStatusItem } from '../state/pluginSlots';
  import { toneColor } from '../state/widgets';
  import { t } from '../i18n/index.svelte';
  let { activePath = '', consoleCount = 0, bottomPanelOpen = false, onToggleBottomPanel, pluginLeft = [], pluginRight = [], onPluginCommand }: {
    activePath?: string;
    consoleCount?: number;
    bottomPanelOpen?: boolean;
    onToggleBottomPanel?: () => void;
    pluginLeft?: ResolvedStatusItem[];
    pluginRight?: ResolvedStatusItem[];
    onPluginCommand?: (pluginId: string, command: string) => void;
  } = $props();

  function runs(items: ResolvedStatusItem[]): { group?: string; items: ResolvedStatusItem[] }[] {
    const out: { group?: string; items: ResolvedStatusItem[] }[] = [];
    for (const it of items) {
      const last = out[out.length - 1];
      if (it.group && last && last.group === it.group) last.items.push(it);
      else out.push({ group: it.group, items: [it] });
    }
    return out;
  }
</script>

{#snippet chipBody(it: ResolvedStatusItem)}
  <!-- iconPath: sanitized SVG path data (pluginSlots.cleanIconPath) → inline brand
       icon in currentColor, optionally tinted by iconColor (e.g. brand terracotta). -->
  {#if it.iconPath}<svg class="pi-ic" viewBox="0 0 24 24" fill="currentColor" style:color={it.iconColor}><path d={it.iconPath} /></svg>{/if}{it.icon ? it.icon + ' ' : ''}{it.text}
{/snippet}

{#snippet chip(it: ResolvedStatusItem)}
  {#if it.command}
    <button class="pi" class:fill={it.fill} class:alert={it.alert} style:color={it.fill ? 'var(--sidebar)' : (it.color ?? toneColor(it.tone))} style:background={it.fill ? (it.color ?? toneColor(it.tone)) : undefined} onclick={() => onPluginCommand?.(it.pluginId, it.command as string)}>{@render chipBody(it)}</button>
  {:else}
    <span class="pi" class:fill={it.fill} class:alert={it.alert} style:color={it.fill ? 'var(--sidebar)' : (it.color ?? toneColor(it.tone))} style:background={it.fill ? (it.color ?? toneColor(it.tone)) : undefined}>{@render chipBody(it)}</span>
  {/if}
{/snippet}

<footer class="statusbar">
  <div class="left">
    <button
      class="panel-toggle"
      class:open={bottomPanelOpen}
      aria-label={t('status.toggleBottomPanel')}
      aria-pressed={bottomPanelOpen}
      title={t('status.bottomPanelTitle')}
      onclick={() => onToggleBottomPanel?.()}
    ><span class="ico"></span></button>
    {#if activePath}<span class="led"></span>{/if}<span class="path">{activePath}</span>
    {#each runs(pluginLeft) as run, ri (ri)}
      {#if run.group}<span class="chip-group">{#each run.items as it (it.pluginId + ':' + it.id)}{@render chip(it)}{/each}</span>
      {:else}{#each run.items as it (it.pluginId + ':' + it.id)}{@render chip(it)}{/each}{/if}
    {/each}
  </div>
  <div class="right">
    {#each runs(pluginRight) as run, ri (ri)}
      {#if run.group}<span class="chip-group">{#each run.items as it (it.pluginId + ':' + it.id)}{@render chip(it)}{/each}</span>
      {:else}{#each run.items as it (it.pluginId + ':' + it.id)}{@render chip(it)}{/each}{/if}
    {/each}
    <span class="consoles">⌁ {consoleCount} {pluralConsoles(consoleCount)}</span>
  </div>
</footer>

<style>
  .statusbar {
    height: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 11px;
    background: var(--bg-elevated);
    border-top: 1px solid var(--border);
    font: 11px var(--ui-font);
    color: var(--text-dim);
    overflow: hidden;
  }
  .left { display: flex; align-items: center; gap: 9px; min-width: 0; }
  /* LED dot of the active path: accent circle 7×7px */
  .led { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
  .path { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-bright); }
  .right { display: flex; align-items: center; gap: 13px; flex-shrink: 0; }
  .panel-toggle {
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: none; cursor: pointer;
    padding: 0 2px; color: var(--text-dim); flex-shrink: 0;
  }
  .panel-toggle:hover { color: var(--text); }
  .panel-toggle.open { color: var(--accent); }
  .pi { background: none; border: none; font: inherit; color: var(--text-dim); cursor: default; padding: 0; white-space: nowrap; }
  /* Inline brand icon on a chip: sized to the 11px bar font, baseline-tucked. */
  .pi .pi-ic { width: 11px; height: 11px; display: inline-block; vertical-align: -1.5px; margin-right: 4px; }
  button.pi { cursor: pointer; }
  button.pi:hover { color: var(--text); }
  .pi.fill { padding: 1px 8px; border-radius: 5px; font-weight: 500; }
  /* teal notification pulse: ring via tzPulseDot (S0/keyframe); uwPulse kept in theme.css */
  .pi.alert { animation: tzPulseDot 1.8s ease-in-out infinite; border-radius: 5px; }
  .chip-group { display: inline-flex; align-items: center; gap: 7px; padding: 2px 8px; border: 1px solid var(--border); background: var(--bg-elevated); border-radius: 6px; }
  /* Drawn "window with a bottom dock" icon: frame + filled bottom bar
     (currentColor → changes with .open). Not a glyph — robust to font/engine,
     does not "merge" with the sidebar's ☰ (see spec §2). */
  .ico {
    position: relative; display: inline-block;
    width: 14px; height: 11px;
    border: 1.4px solid currentColor; border-radius: 2px;
  }
  .ico::after {
    content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 3px;
    background: currentColor;
  }
</style>
