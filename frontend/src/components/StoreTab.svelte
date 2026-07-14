<script lang="ts">
  import type { StoreEntry, UpdateInfo } from '../bridge/plugins';
  import { t } from '../i18n/index.svelte';

  // Presentational store catalog list (spec §5.2). All data and mutations come
  // from the parent — mirroring ExtensionsScreen's prop-driven design.
  let { entries, stale, loading, error, installed, updates, busyId, onOpen, onInstall, onUpdate, onRefresh }: {
    entries: StoreEntry[];
    stale: boolean;
    loading: boolean;
    error: string;
    installed: Record<string, string>;
    updates: Record<string, UpdateInfo>;
    busyId: string | null;
    onOpen: (id: string) => void;
    onInstall: (id: string) => void;
    onUpdate: (id: string) => void;
    onRefresh: () => void;
  } = $props();

  let query = $state('');
  const filtered = $derived(
    entries.filter((e) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q)
      );
    })
  );

  function statusFor(id: string): 'update' | 'installed' | 'none' {
    if (updates[id]) return 'update';
    if (installed[id]) return 'installed';
    return 'none';
  }
</script>

<div class="filter">
  <input
    type="search"
    placeholder={t('ext.store.searchPlaceholder')}
    aria-label={t('ext.store.searchAria')}
    bind:value={query}
  />
  {#if stale}<span class="stale">{t('ext.store.offline')}</span>{/if}
  <button class="refresh" aria-label={t('ext.store.refreshAria')} onclick={onRefresh}>⟳</button>
</div>

<div class="list">
  {#if error && !entries.length}
    <div class="error-banner">{t('ext.store.loadError', { msg: error })}</div>
  {:else if loading && !entries.length}
    <div class="empty">{t('ext.store.loading')}</div>
  {:else if !entries.length}
    <div class="empty">{t('ext.store.empty')}</div>
  {:else if !filtered.length}
    <div class="empty">{t('ext.store.noMatches')}</div>
  {:else}
    {#each filtered as e (e.id)}
      <div class="row">
        <button class="row-open" aria-label={t('ext.store.openAria', { name: e.name })} onclick={() => onOpen(e.id)}>
          <span class="ico">🧩</span>
          <span class="meta">
            <span class="name-line">
              <span class="name">{e.name}</span>
              <span class="sub">v{e.version} · {e.publisher}</span>
            </span>
            <span class="desc">{e.description}</span>
          </span>
        </button>
        {#if statusFor(e.id) === 'installed'}
          <span class="stat"><span class="dot"></span>{t('ext.store.statusInstalled')}</span>
        {:else if statusFor(e.id) === 'update'}
          <button class="upd" disabled={busyId === e.id} onclick={() => onUpdate(e.id)}>
            {t('ext.store.update')}
          </button>
        {:else}
          <button class="inst" disabled={busyId === e.id} onclick={() => onInstall(e.id)}>
            {t('ext.store.install')}
          </button>
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .filter { display: flex; align-items: center; gap: 8px; margin: 10px 0; }
  .filter input {
    flex: 1; background: var(--bg); border: 1px solid var(--border); color: var(--text);
    border-radius: var(--radius, 6px); padding: 6px 10px; font: 12px var(--ui-font); outline: none;
  }
  .filter input:focus { border-color: var(--accent); }
  .stale {
    color: var(--text-dim); border: 1px solid var(--border); border-radius: 999px;
    padding: 2px 8px; font-size: 11px; white-space: nowrap;
  }
  .refresh {
    background: none; border: 1px solid var(--border); color: var(--text-dim);
    border-radius: var(--radius, 6px); padding: 4px 8px; cursor: pointer; font-size: 13px;
  }
  .refresh:hover { color: var(--text); }
  .list { overflow-y: auto; min-height: 120px; }
  .error-banner { color: var(--red); padding: 14px 4px; font-size: 12px; }
  .empty { color: var(--text-faint); padding: 22px 4px; text-align: center; font-size: 12px; }
  .row { display: flex; align-items: center; gap: 8px; padding: 6px 4px; border-bottom: 1px solid var(--border); }
  .row-open {
    flex: 1; display: flex; align-items: center; gap: 10px; background: none; border: none;
    color: var(--text); text-align: left; cursor: pointer; padding: 4px; min-width: 0;
  }
  .ico { font-size: 18px; }
  .meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .name-line { display: flex; align-items: baseline; gap: 8px; }
  .name { font-weight: 600; font-size: 13px; }
  .sub { color: var(--text-dim); font-size: 11px; }
  .desc { color: var(--text-dim); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .stat { display: inline-flex; align-items: center; gap: 6px; color: var(--text-dim); font-size: 12px; white-space: nowrap; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); }
  .inst, .upd {
    border: 1px solid var(--border); border-radius: var(--radius, 6px); padding: 4px 12px;
    cursor: pointer; font: 12px var(--ui-font); white-space: nowrap;
  }
  .inst { background: var(--accent); border-color: var(--accent); color: var(--bg); font-weight: 600; }
  .upd { background: none; color: var(--accent); border-color: var(--accent); }
  .inst:disabled, .upd:disabled { opacity: 0.5; cursor: default; }
</style>
