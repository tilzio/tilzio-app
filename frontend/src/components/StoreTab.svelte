<script lang="ts">
  import type { StoreEntry } from '../bridge/plugins';
  import { t } from '../i18n/index.svelte';

  // Presentational store catalog list (spec §5.2). All data and mutations come
  // from the parent — mirroring ExtensionsScreen's prop-driven design.
  let { entries, stale, loading, error, installed, busyId, onOpen, onInstall, onRefresh }: {
    entries: StoreEntry[];
    stale: boolean;
    loading: boolean;
    error: string;
    installed: Record<string, string>;
    busyId: string | null;
    onOpen: (id: string) => void;
    onInstall: (id: string) => void;
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

  // Updates are actioned from the Installed-tab badge and the extension card —
  // the Store list row only ever shows Install or Installed.
  function statusFor(id: string): 'installed' | 'none' {
    if (installed[id]) return 'installed';
    return 'none';
  }
</script>

<div class="toolbar">
  <!-- Search pill — mirrors ExtensionsScreen's Installed-tab filter (magnifier + input + counter) -->
  <div class="filter">
    <svg class="mag" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5"/>
      <line x1="20" y1="20" x2="15.6" y2="15.6"/>
    </svg>
    <input
      type="search"
      placeholder={t('ext.store.searchPlaceholder')}
      aria-label={t('ext.store.searchAria')}
      bind:value={query}
    />
    <span class="count">{filtered.length}</span>
  </div>
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
  .toolbar { display: flex; align-items: center; gap: 8px; margin: 10px 0; }
  /* Search pill (item 5): copied from ExtensionsScreen's Installed-tab filter */
  .filter { display: flex; align-items: center; gap: 9px; background: var(--sidebar); border: 1px solid var(--border); border-radius: 6px; padding: 7px 11px; flex: 1; min-width: 0; }
  .filter:focus-within { border-color: var(--accent); }
  .mag { width: 14px; height: 14px; stroke: var(--text-dim); stroke-width: 1.9; stroke-linecap: round; fill: none; flex: none; }
  .filter input { flex: 1; min-width: 0; background: none; border: none; color: var(--text); font: inherit; font-size: 12px; outline: none; }
  .filter input::placeholder { color: var(--text-dim); }
  .count { font-size: 10px; color: var(--text-faint); }
  .stale {
    color: var(--text-dim); border: 1px solid var(--border); border-radius: 999px;
    padding: 2px 8px; font-size: 11px; white-space: nowrap;
  }
  .refresh {
    background: none; border: 1px solid var(--border); color: var(--text-dim);
    border-radius: var(--radius); padding: 4px 8px; cursor: pointer; font-size: 13px;
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
  .inst {
    border: 1px solid var(--border); border-radius: var(--radius); padding: 4px 12px;
    cursor: pointer; font: 12px var(--ui-font); white-space: nowrap;
  }
  .inst { background: var(--accent); border-color: var(--accent); color: var(--bg); font-weight: 600; }
  .inst:disabled { opacity: 0.5; cursor: default; }
</style>
