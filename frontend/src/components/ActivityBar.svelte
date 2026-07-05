<script lang="ts">
  // Narrow vertical strip at the left edge (VS Code/GoLand). Presentational.
  // ☰ at the top (navigator), plugin icons below it; ⚙ (settings) at the bottom.
  import type { ResolvedActivityButton } from '../state/pluginSlots';
  import { t } from '../i18n/index.svelte';
  let { collapsed = false, onToggleSidebar, onOpenSettings, onOpenExtensions,
    pluginButtons = [], onPluginButton }: {
    collapsed?: boolean;
    onToggleSidebar?: () => void;
    onOpenSettings?: () => void;
    onOpenExtensions?: () => void;
    pluginButtons?: ResolvedActivityButton[];
    onPluginButton?: (pluginId: string, opens: string) => void;
  } = $props();
</script>

<div class="activitybar">
  <button class="ab-btn toggle" class:active={!collapsed} aria-label={t('activityBar.toggleSidebar')} aria-expanded={!collapsed} title={t('activityBar.navigationSidebar')} onclick={() => onToggleSidebar?.()}>☰</button>
  {#each pluginButtons as b (b.pluginId + ':' + b.id)}
    <button class="ab-btn plugin" aria-label={b.title} title={b.title} onclick={() => onPluginButton?.(b.pluginId, b.opens)}>{b.icon}</button>
  {/each}
  <div class="spacer"></div>
  <button class="ab-btn ext" aria-label={t('activityBar.extensions')} title={t('activityBar.extensions')} onclick={() => onOpenExtensions?.()}>
    <svg viewBox="0 0 16 16" width="17" height="17" fill="currentColor" aria-hidden="true"><rect x="1.2" y="8.6" width="6" height="6" rx="1.3"/><rect x="8.2" y="8.6" width="6" height="6" rx="1.3"/><rect x="1.2" y="1.6" width="6" height="6" rx="1.3"/><rect x="8.9" y="0.8" width="6" height="6" rx="1.3" transform="rotate(45 11.9 3.8)"/></svg>
  </button>
  <button class="ab-btn settings" aria-label={t('activityBar.settings')} title={t('activityBar.settings')} onclick={() => onOpenSettings?.()}>⚙</button>
</div>

<style>
  /* gap 2px between buttons (S2.2) */
  .activitybar { width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; padding: 8px 0; gap: 2px; background: var(--breadcrumb); border-right: 1px solid var(--border); font: 13px var(--ui-font); }
  .spacer { flex: 1; }
  .ab-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; border-radius: var(--radius); color: var(--text-dim); font-size: 18px; line-height: 1; cursor: pointer; }
  .ab-btn:hover { color: var(--text); background: color-mix(in srgb, var(--text) 8%, transparent); }
  .ab-btn.active { color: var(--text); box-shadow: inset 2px 0 0 var(--accent); }
  /* plugin icons a bit smaller than the base ones (S2.2) */
  .ab-btn.plugin { font-size: 15px; }
  .settings { font-size: 22px; }
  .ext svg { display: block; }
</style>
