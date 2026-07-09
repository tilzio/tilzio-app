<script lang="ts">
  import { onDestroy } from 'svelte';
  import { pluginViewBridge } from '../bridge/pluginViewBridge';
  import { dragState } from '../bridge/dragState.svelte';

  let { pluginId, entry, frameId, title = '' }: {
    pluginId: string; entry: string; frameId: string; title?: string;
  } = $props();

  let iframeEl: HTMLIFrameElement | undefined = $state(undefined);
  let myWin: Window | null = null; // the window THIS component registered

  function onIframeLoad() {
    myWin = iframeEl?.contentWindow ?? null;
    if (myWin) pluginViewBridge.register(frameId, pluginId, myWin);
  }
  onDestroy(() => pluginViewBridge.unregister(frameId, myWin ?? undefined));
</script>

<div class="view-wrap">
  <iframe class="view" src={`/plugins/${pluginId}/${entry}`} {title} sandbox="allow-scripts" bind:this={iframeEl} onload={onIframeLoad}></iframe>
  {#if dragState.dragId !== null}
    <!-- A cross-origin sandbox iframe swallows HTML5 dragover/drop; this plain-DOM overlay in
         the parent catches them so they bubble to the leaf wrapper. Only during a pane drag. -->
    <div class="drag-catcher" aria-hidden="true"></div>
  {/if}
</div>

<style>
  .view-wrap { position: relative; flex: 1; min-height: 0; display: flex; }
  .view { flex: 1; min-height: 0; width: 100%; border: none; background: var(--bg); position: relative; z-index: 0; }
  .drag-catcher { position: absolute; inset: 0; z-index: 1; }
</style>
