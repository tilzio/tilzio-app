<script lang="ts">
  import type { StoreEntry, StoreDetail, UpdateInfo } from '../bridge/plugins';
  import { resolvePermission } from '../state/permissionLabels';
  import { renderMarkdown } from '../bridge/mdPreview';
  import { focusTrap } from './focusTrap';
  import { t } from '../i18n/index.svelte';

  // Store extension card (spec §5.2): catalog entry + fetched detail (README).
  // Presentational — install/update/uninstall orchestration lives in App.svelte.
  let { entry, detail, detailError, installedVersion, update, busy, error, onInstall, onUpdate, onUninstall, onBack }: {
    entry: StoreEntry;
    detail: StoreDetail | null;
    detailError: string;
    installedVersion: string;
    update?: UpdateInfo;
    busy: boolean;
    error: string;
    onInstall: () => void;
    onUpdate: () => void;
    onUninstall: () => void;
    onBack: () => void;
  } = $props();

  const perms = $derived((entry.permissions ?? []).map((p) => resolvePermission(p, entry.exec ?? [])));
  // README goes through the app's single sanitize pipeline (marked+dompurify) —
  // the only allowed {@html} source (security invariant §5.1).
  const readmeHtml = $derived(detail && detail.readme ? renderMarkdown(detail.readme) : '');

  // Autofocus the back button so accidental Enter closes the detail card.
  function autofocus(node: HTMLButtonElement) {
    node.focus();
  }
</script>

<div class="overlay" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onBack(); }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label={t('ext.store.openAria', { name: entry.name })} use:focusTrap>
    <div class="backbar">
      <button class="back" use:autofocus onclick={onBack}>← {t('ext.back')}</button>
    </div>

    <div class="identity">
      <span class="badge-ico">🧩</span>
      <div class="titles">
        <div class="name">{entry.name}</div>
        <div class="sub">v{entry.version} · {entry.id}</div>
        {#if installedVersion && installedVersion !== entry.version}
          <div class="sub dim">{t('ext.store.installedVersion', { version: installedVersion })}</div>
        {/if}
      </div>
      <div class="hactions">
        {#if update}
          <button class="upd" disabled={busy} onclick={onUpdate}>{t('ext.store.updateTo', { version: update.to })}</button>
        {:else if !installedVersion}
          <button class="inst" disabled={busy} onclick={onInstall}>{busy ? t('ext.store.installing') : t('ext.store.install')}</button>
        {/if}
        {#if installedVersion}
          <button class="trash" disabled={busy} onclick={onUninstall}>{t('ext.store.uninstall')}</button>
        {/if}
      </div>
    </div>

    {#if error}<div class="error-banner">{error}</div>{/if}

    <div class="body">
      <p class="desc">{entry.description}</p>

      <div class="section">{t('ext.store.publisher')}</div>
      <div class="pub"><span>{entry.publisher}</span>{#if entry.homepage}<span class="dim"> · {entry.homepage}</span>{/if}</div>

      <div class="section">{t('ext.sectionPermissions')}</div>
      {#if perms.length}
        <div class="chips">
          {#each perms as p (p.title)}
            <span class="chip" style="background:{p.bg};color:{p.color}">{p.icon} {p.title}</span>
          {/each}
        </div>
      {:else}
        <div class="dim">{t('ext.requestsNoPermissions')}</div>
      {/if}

      <div class="section">{t('ext.store.sectionReadme')}</div>
      {#if detail === null && !detailError}
        <div class="dim">{t('ext.store.loading')}</div>
      {:else if detailError}
        <div class="dim">{t('ext.store.readmeUnavailable')}</div>
      {:else if !readmeHtml}
        <div class="dim">{t('ext.store.noReadme')}</div>
      {:else}
        <!-- eslint-disable-next-line svelte/no-at-html-tags — sanitized by renderMarkdown -->
        <div class="readme">{@html readmeHtml}</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; background: #000a; }
  .dialog {
    background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px;
    padding: 18px; width: 600px; max-width: 90%; max-height: 80vh; display: flex; flex-direction: column;
    box-shadow: 0 20px 56px #0009; font: 13px var(--ui-font); color: var(--text);
  }
  .backbar { margin-bottom: 10px; }
  .back { background: none; border: none; color: var(--text-dim); cursor: pointer; font: 12px var(--ui-font); padding: 2px 0; }
  .back:hover { color: var(--text); }
  .identity { display: flex; align-items: center; gap: 12px; }
  .badge-ico { font-size: 26px; }
  .titles { flex: 1; min-width: 0; }
  .name { font-size: 15px; font-weight: 700; }
  .sub { color: var(--text-dim); font-size: 11px; }
  .dim { color: var(--text-faint); }
  .hactions { display: flex; gap: 8px; }
  .inst, .upd, .trash {
    border: 1px solid var(--border); border-radius: var(--radius, 6px); padding: 5px 14px;
    cursor: pointer; font: 12px var(--ui-font); white-space: nowrap;
  }
  .inst { background: var(--accent); border-color: var(--accent); color: var(--bg); font-weight: 600; }
  .upd { background: none; color: var(--accent); border-color: var(--accent); }
  .trash { background: none; color: var(--red); border-color: var(--border); }
  .inst:disabled, .upd:disabled, .trash:disabled { opacity: 0.5; cursor: default; }
  .error-banner { color: var(--red); font-size: 12px; margin-top: 10px; }
  .body { overflow-y: auto; margin-top: 8px; }
  .desc { color: var(--text-dim); margin: 8px 0; }
  .section { color: var(--text-faint); font-size: 10px; letter-spacing: 0.08em; margin: 14px 0 6px; }
  .pub { font-size: 12px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { border-radius: 999px; padding: 3px 10px; font-size: 11px; }
  /* README is injected HTML ({@html}) — scoped selectors can't reach it. */
  .readme { font-size: 12px; line-height: 1.55; }
  .readme :global(h1), .readme :global(h2), .readme :global(h3) { font-size: 13px; margin: 12px 0 6px; }
  .readme :global(p) { margin: 6px 0; }
  .readme :global(code) { background: var(--bg); border-radius: 4px; padding: 1px 4px; }
  .readme :global(pre) { background: var(--bg); border-radius: 6px; padding: 8px; overflow-x: auto; }
  .readme :global(a) { color: var(--accent); }
  .readme :global(ul), .readme :global(ol) { padding-left: 18px; }
</style>
