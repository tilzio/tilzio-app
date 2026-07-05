<script lang="ts">
  import { onDestroy } from 'svelte';
  import PaneHeader from './PaneHeader.svelte';
  import { pluginHost } from '../bridge/pluginHost.svelte';
  import { pluginViewBridge } from '../bridge/pluginViewBridge';
  import { pluginsBridge, type PluginManifest } from '../bridge/plugins';
  import { enablePlugin } from '../bridge/pluginManage';
  import { dragState } from '../bridge/dragState.svelte';
  import { t } from '../i18n/index.svelte';

  let {
    paneId, pluginId, viewId, active = false, zoomed = false,
    onFocus, onSplit, onClose, onZoom, onOpenExtensions,
  }: {
    paneId: string; pluginId: string; viewId: string; active?: boolean; zoomed?: boolean;
    onFocus?: () => void; onSplit?: (dir: 'h' | 'v') => void; onClose?: () => void;
    onZoom?: () => void; onOpenExtensions?: () => void;
  } = $props();

  // Live plugin in the active registry (reactively).
  const plugin = $derived(pluginHost.active.find((p) => p.id === pluginId));
  const view = $derived(plugin?.contributes.views.find((v) => v.id === viewId));
  const live = $derived(!!plugin && !plugin.error && !!view);
  const title = $derived(view?.title ?? pluginId);

  // Placeholder classification when the view isn't live. installed/manifest is loaded on-demand
  // to distinguish «disabled» (installed but off) from «not found» (removed).
  type PaneStatus = 'live' | 'view-missing' | 'disabled' | 'missing' | 'loading';
  let installedManifest: PluginManifest | null = $state(null);
  let probed: boolean = $state(false);

  const paneStatus: PaneStatus = $derived(
    live ? 'live'
    : plugin ? 'view-missing'          // active, but the view isn't declared / error
    : !probed ? 'loading'
    : installedManifest ? 'disabled'   // installed, but disabled
    : 'missing'                        // not installed
  );

  // Probe the registry once when the plugin isn't active (to distinguish disabled vs missing).
  $effect(() => {
    if (plugin || probed) return;
    let cancelled = false;
    void pluginsBridge.list().then((list) => {
      if (cancelled) return;
      installedManifest = list.find((p) => p.manifest?.id === pluginId)?.manifest ?? null;
      probed = true;
    }).catch(() => { if (!cancelled) probed = true; });
    return () => { cancelled = true; };
  });

  let iframeEl: HTMLIFrameElement | undefined = $state(undefined);
  let myWin: Window | null = null;   // the window THIS component registered
  function onIframeLoad() {
    myWin = iframeEl?.contentWindow ?? null;
    if (myWin) pluginViewBridge.register(paneId, pluginId, myWin);
  }
  onDestroy(() => pluginViewBridge.unregister(paneId, myWin ?? undefined));

  function doEnable() {
    if (installedManifest) void enablePlugin(installedManifest);
    else onOpenExtensions?.();
  }
</script>

<div class="pane" class:active role="presentation" data-pane-id={paneId} onpointerdown={() => onFocus?.()}>
  <PaneHeader {paneId} {title} {active} {zoomed} {onSplit} {onZoom} {onClose} />
  {#if paneStatus === 'live'}
    {@const src = `/plugins/${pluginId}/${view!.entry}`}
    <div class="view-wrap">
      <iframe class="view" {src} title={title} sandbox="allow-scripts" bind:this={iframeEl} onload={onIframeLoad}></iframe>
      {#if dragState.dragId !== null}
        <!-- Pane drag: a cross-origin sandbox iframe swallows HTML5 dragover/drop, and
             WKWebView doesn't forward them to the .leaf wrapper even with pointer-events:none on the iframe.
             The overlay is plain DOM in the parent document over the iframe: it catches drag events,
             which bubble up to the SplitContainer wrapper (zone highlight + drop). At rest it isn't rendered
             → the iframe is fully interactive. -->
        <div class="drag-catcher" aria-hidden="true"></div>
      {/if}
    </div>
  {:else}
    <div class="placeholder" class:missing={paneStatus === 'missing'}>
      <div class="ico">{paneStatus === 'missing' ? '⚠' : '🧩'}</div>
      {#if paneStatus === 'view-missing'}
        <div class="ttl">{t('plugin.viewUnavailable')}</div>
        <div class="msg">{t('plugin.viewMissingMsg', { name: plugin?.name ?? pluginId })}<code>{viewId}</code>.</div>
        <div class="acts"><button onclick={() => onClose?.()}>{t('plugin.closePane')}</button></div>
      {:else if paneStatus === 'missing'}
        <div class="ttl">{t('plugin.notFoundTitle')}</div>
        <div class="msg">{t('plugin.notFoundMsg')}</div>
        <div class="acts"><button onclick={() => onClose?.()}>{t('plugin.closePane')}</button><button onclick={() => onOpenExtensions?.()}>{t('plugin.extensionsBtn')}</button></div>
      {:else if paneStatus === 'disabled'}
        <div class="ttl">{t('plugin.disabledTitle')}</div>
        <div class="msg">{t('plugin.disabledMsg', { name: installedManifest?.name ?? pluginId })}</div>
        <div class="acts"><button class="primary" onclick={doEnable}>{t('plugin.enable')}</button><button onclick={() => onClose?.()}>{t('plugin.closePane')}</button></div>
      {:else}
        <div class="msg">{t('plugin.loading')}</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .pane { position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; box-sizing: border-box; isolation: isolate; background: var(--bg); }
  .pane.active::before { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 3; box-shadow: inset 0 0 0 2px var(--accent); }
  .view-wrap { position: relative; flex: 1; min-height: 0; display: flex; }
  .view { flex: 1; min-height: 0; width: 100%; border: none; background: var(--bg); position: relative; z-index: 0; }
  /* Transparent drag-event catcher over the iframe (only during a pane drag).
     z-index above the iframe(0), below the .drop-hl/.pane.active highlight (z-index:3 in the .leaf wrapper). */
  .drag-catcher { position: absolute; inset: 0; z-index: 1; }
  .placeholder { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; padding: 16px; color: var(--text-dim); }
  .placeholder.missing { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--red) 22%, transparent); }
  .placeholder .ico { font-size: 26px; opacity: 0.6; }
  .placeholder.missing .ico { color: var(--red); opacity: 0.85; }
  .placeholder .ttl { font-size: 13px; color: var(--text); }
  .placeholder .msg { font-size: 12px; line-height: 1.4; }
  .placeholder .acts { display: flex; gap: 8px; margin-top: 4px; }
  .placeholder button { font: 11px var(--ui-font); padding: 4px 12px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--bg-elevated); color: var(--text-dim); cursor: pointer; }
  .placeholder button.primary { border-color: color-mix(in srgb, var(--accent) 60%, var(--border)); color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .placeholder button:hover { color: var(--text); }
</style>
