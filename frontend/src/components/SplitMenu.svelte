<script lang="ts">
  import { t } from '../i18n/index.svelte';
  let { onTerminal, onEditor, onOpenFile, onClose }:
    { onTerminal: () => void; onEditor: () => void; onOpenFile: () => void; onClose: () => void } = $props();
  function pick(fn: () => void) { fn(); onClose(); }
  function autofocus(node: HTMLElement) { node.focus(); }
</script>

<div class="menu" role="menu" tabindex="-1" use:autofocus
     onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
  <div class="hd">{t('menu.split.header')}</div>
  <button role="menuitem" onclick={() => pick(onTerminal)}><span class="ic">⊞</span><span class="lbl">{t('menu.split.terminal')}</span></button>
  <button role="menuitem" onclick={() => pick(onEditor)}><span class="ic">✎</span><span class="lbl">{t('menu.split.editor')}</span></button>
  <button role="menuitem" onclick={() => pick(onOpenFile)}><span class="ic">📂</span><span class="lbl">{t('menu.split.openFile')}</span></button>
</div>

<style>
  .menu { position: absolute; top: 100%; right: 0; z-index: 5; min-width: 200px;
    background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 6px;
    box-shadow: 0 8px 28px #000a; padding: 5px; font: 12px var(--ui-font); }
  .hd { font-size: 9.5px; color: var(--text-dim); text-transform: uppercase; letter-spacing: .5px; padding: 3px 9px 4px; }
  button { display: flex; width: 100%; gap: 8px; padding: 7px 9px; background: none; border: none;
    color: var(--text); border-radius: 4px; cursor: pointer; font: inherit; text-align: left; }
  button:hover, button:focus { background: #ffffff12; outline: none; }
</style>
