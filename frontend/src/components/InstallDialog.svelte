<script lang="ts">
  import type { ConflictInfo } from '../bridge/plugins';
  import { focusTrap } from './focusTrap';
  import { t } from '../i18n/index.svelte';

  let { status, errorMsg = '', conflict = null, onFileBytes, onUrl, onConfirmOverwrite, onClose }: {
    status: 'idle' | 'busy' | 'error' | 'conflict';
    errorMsg?: string;
    conflict?: ConflictInfo | null;
    onFileBytes: (bytes: Uint8Array) => void;
    onUrl: (url: string) => void;
    onConfirmOverwrite: () => void;
    onClose: () => void;
  } = $props();

  let url = $state('');
  let dragActive = $state(false);
  const busy = $derived(status === 'busy');

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    const buf = await file.arrayBuffer();
    onFileBytes(new Uint8Array(buf));
  }
  function onInputChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    void handleFile(input.files?.[0]);
    input.value = ''; // allow re-selecting the same file
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragActive = false;
    if (busy) return;
    void handleFile(e.dataTransfer?.files?.[0]);
  }
  function onDragOver(e: DragEvent) { e.preventDefault(); if (!busy) dragActive = true; }
  function onDragLeave() { dragActive = false; }
  function submitUrl() { const u = url.trim(); if (u && !busy) onUrl(u); }
  // Move focus into the modal on open (like ConfirmDialog/PermissionConsentDialog):
  // «Close» — a safe target, a stray Enter doesn't start the installation.
  function autofocus(node: HTMLButtonElement) { node.focus(); }
</script>

<div class="overlay" role="presentation" onclick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label={t('ext.installTitle')} tabindex="-1" use:focusTrap>
    <div class="head">
      <div class="title">{t('ext.installTitle')}</div>
      <!-- ✕ — safe autofocus target; aria-label is required for a11y (icon without visible text) -->
      <button class="close" aria-label={t('ext.closeLabel')} use:autofocus onclick={() => onClose()} disabled={busy}>✕</button>
    </div>

    {#if status === 'conflict' && conflict}
      <div class="conflict">
        <!-- Header: amber chip ⚠ + text -->
        <div class="conflict-head">
          <span class="conflict-chip" aria-hidden="true">⚠</span>
          <span class="conflict-title">{t('ext.conflictTitle')}</span>
        </div>
        <!-- Conflict description: plugin name, suggestion to replace -->
        <div class="msg">{t('ext.conflictMsg', { id: conflict.id })}</div>
        <!-- Framed version row: old → new -->
        <div class="ver-row">
          <span class="ver-old">v{conflict.existingVersion}</span>
          <span class="arrow">→</span>
          <span class="ver-new">v{conflict.newVersion}</span>
        </div>
        <div class="cbtns">
          <button class="cancel" onclick={() => onClose()}>{t('ext.cancel')}</button>
          <button class="replace" onclick={() => onConfirmOverwrite()}>{t('ext.replace')}</button>
        </div>
      </div>
    {:else}
      <label class="drop" class:active={dragActive} ondragover={onDragOver} ondragleave={onDragLeave} ondrop={onDrop}>
        <input class="file" type="file" accept=".zip,application/zip" onchange={onInputChange} disabled={busy} />
        <!-- upload SVG icon, decorative aria-hidden; color = accent -->
        <svg class="drop-icon" aria-hidden="true" viewBox="0 0 24 24" width="30" height="30"
          fill="none" stroke="currentColor" stroke-width="1.7"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 16V4"/>
          <polyline points="7 9 12 4 17 9"/>
          <path d="M5 20h14"/>
        </svg>
        <!-- Two-line text: main line + subline; pointer-events:none on drop-text (DnD flicker) -->
        <span class="drop-text">{t('ext.dropPrefix')}<b>.zip</b>{t('ext.dropSuffix')}<span class="drop-sub">{t('ext.dropSub')}</span></span>
      </label>

      <!-- hairline lines on the sides of the «or from URL» label -->
      <div class="or"><span class="or-line"></span>{t('ext.orFromUrl')}<span class="or-line"></span></div>

      <div class="url-row">
        <input
          type="url" class="url" placeholder={t('ext.urlPlaceholder')} bind:value={url} disabled={busy}
          onkeydown={(e) => { if (e.key === 'Enter') submitUrl(); }}
        />
        <button class="download" onclick={submitUrl} disabled={busy || !url.trim()}>{t('ext.download')}</button>
      </div>

      {#if status === 'busy'}<div class="busy">{t('ext.installing')}</div>{/if}
      {#if status === 'error'}<div class="error">⚠ {errorMsg}</div>{/if}
    {/if}
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; z-index: 105; display: flex; align-items: center; justify-content: center; background: #000a; }
  /* S9.1: radius-xl, padding 18px, deepened shadow */
  .dialog { background: var(--bg-elevated); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-xl); padding: 18px; width: 460px; max-width: 90%; box-shadow: 0 20px 56px #0009; font: 13px var(--ui-font); }
  /* S9.4: margin-bottom 15px (was 14px) */
  .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; }
  .title { font-weight: 700; font-size: 15px; }
  /* S9.4: ✕ icon without background/border, color text-faint; hover→text; disabled→0.4 */
  .close { color: var(--text-faint); font-size: 13px; background: none; border: none; padding: 0; cursor: pointer; }
  .close:hover:not(:disabled) { color: var(--text); }
  .close:disabled { opacity: 0.4; cursor: not-allowed; }
  /* S9.2: flex-column, gap 12px, min-height 128px, dashed 1.5px #504945, radius 8px, padding 20px, bg #2c2926 */
  .drop { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; min-height: 128px; border: 1.5px dashed #504945; border-radius: 8px; cursor: pointer; color: var(--text-dim); padding: 20px; gap: 12px; background: #2c2926; }
  .drop:hover, .drop.active { border-color: var(--accent); color: var(--text); background: var(--active-row); }
  /* sr-only: the input stays keyboard-focusable (the label wrapper is clicked by mouse). */
  .file { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); border: 0; white-space: nowrap; }
  /* S9.2: upload icon — accent color, decorative (pointer-events:none) */
  .drop-icon { color: var(--accent); pointer-events: none; }
  /* Decorative text — pointer-events:none, otherwise hovering the cursor over it
     during DnD fires dragleave on .drop and the drop-zone highlight flickers. */
  .drop-text { pointer-events: none; line-height: 1.5; display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .drop-text b { color: var(--accent); }
  /* S9.2: drop-zone subline — text-dim, font-size 12px */
  .drop-sub { color: var(--text-dim); font-size: 12px; display: block; }
  /* S9.2: «or from URL» — flex with hairline lines on the sides */
  .or { display: flex; align-items: center; gap: 10px; color: var(--text-faint); font-size: 11px; margin: 14px 0; }
  .or-line { flex: 1; height: 1px; background: var(--border); }
  .url-row { display: flex; gap: 8px; }
  /* S9.2: URL input background --sidebar (#1d2021), padding 7×11, radius-lg */
  .url { flex: 1; min-width: 0; background: var(--sidebar); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 7px 11px; font: inherit; }
  .url::placeholder { color: var(--text-faint); }
  /* S9.2: Download — padding 7×14, radius-lg, font-weight 500 */
  .download { border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 7px 14px; cursor: pointer; font: inherit; font-weight: 500; background: var(--bg); color: var(--accent); }
  .download:hover:not(:disabled) { background: var(--active-row); }
  .download:disabled { opacity: 0.4; cursor: not-allowed; }
  .busy { margin-top: 12px; color: var(--text-dim); }
  .error { margin-top: 12px; color: var(--red); font-size: 12px; line-height: 1.4; }
  /* S9.3: conflict block header — icon chip + text */
  .conflict-head { display: flex; gap: 11px; align-items: center; margin-bottom: 13px; }
  /* S9.3: amber chip ⚠ — 32×32 square, radius 8px, translucent amber background */
  .conflict-chip { width: 32px; height: 32px; border-radius: 8px; background: rgba(250,189,47,.14); color: var(--amber); font-size: 16px; display: flex; align-items: center; justify-content: center; flex: none; }
  /* S9.3: conflict title — semibold, slightly larger */
  .conflict-title { font-weight: 600; font-size: 14px; }
  /* S9.3: description text — muted color, increased line spacing */
  .conflict .msg { color: var(--text-dim); line-height: 1.5; margin-bottom: 14px; }
  /* S9.3: framed version row v→v */
  .ver-row { display: flex; align-items: center; justify-content: center; gap: 12px; background: var(--sidebar); border: 1px solid var(--border); border-radius: 7px; padding: 11px; margin-bottom: 16px; }
  /* S9.3: old version — muted, new — bright semibold, arrow — accent */
  .ver-old { color: var(--text-dim); }
  .arrow { color: var(--accent); }
  .ver-new { color: var(--text); font-weight: 700; }
  .cbtns { display: flex; justify-content: flex-end; gap: 8px; }
  /* S9.1: cancel — radius-lg; replace — border-none, radius-lg, padding 7×16, font-weight 600 */
  .cancel { background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 7px 15px; cursor: pointer; font: inherit; }
  .cancel:hover { background: var(--active-row); }
  .replace { background: var(--accent); color: #1d2021; border: none; border-radius: var(--radius-lg); padding: 7px 16px; cursor: pointer; font: inherit; font-weight: 600; }
  .replace:hover { filter: brightness(1.1); }
</style>
