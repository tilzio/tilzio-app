<script lang="ts">
  import type { PluginInfo, StoreEntry, UpdateInfo } from '../bridge/plugins';
  import { declaredPermissions, resolvePermission } from '../state/permissionLabels';
  import { parseContributes } from '../state/pluginContributions';
  import { pluginAccent } from '../state/pluginColor';
  import { focusTrap } from './focusTrap';
  import { t } from '../i18n/index.svelte';
  import StoreTab from './StoreTab.svelte';

  let {
    plugins, runtimeErrorFor, busyId, onToggle, onRefresh, onClose, onInstall,
    onUninstall, onOpenDetail, onOpenFolder = undefined,
    tab = $bindable('installed'),
    storeEntries = [], storeStale = false, storeLoading = false, storeError = '',
    updates = {}, storeBusyId = null,
    onStoreOpen = () => {}, onStoreInstall = () => {}, onStoreUpdate = () => {}, onStoreRefresh = () => {},
  }: {
    plugins: PluginInfo[];
    runtimeErrorFor: (id: string) => string | null;
    busyId: string | null;
    onToggle: (info: PluginInfo, on: boolean) => void;
    onRefresh: () => void;
    onClose: () => void;
    onInstall: () => void;
    onUninstall: (info: PluginInfo) => void;
    onOpenDetail: (id: string) => void;
    onOpenFolder?: () => void;
    tab?: 'installed' | 'store';
    storeEntries?: StoreEntry[];
    storeStale?: boolean;
    storeLoading?: boolean;
    storeError?: string;
    updates?: Record<string, UpdateInfo>;
    storeBusyId?: string | null;
    onStoreOpen?: (id: string) => void;
    onStoreInstall?: (id: string) => void;
    onStoreUpdate?: (id: string) => void;
    onStoreRefresh?: () => void;
  } = $props();

  interface Row {
    info: PluginInfo;
    id: string;
    name: string;
    sub: string;
    icon: string;
    accent: string;
    broken: boolean;
    err: string;
    badges: string[];
    enabled: boolean;
    rtErr: string | null;
  }

  function iconFor(info: PluginInfo): string {
    return parseContributes(info.manifest?.contributes).activityBar[0]?.icon || '🧩';
  }

  const rows = $derived<Row[]>(plugins.map((info) => {
    const id = info.manifest?.id ?? info.dir;
    const broken = !!info.err;
    const ex = info.manifest?.exec ?? [];
    return {
      info,
      id,
      name: info.manifest?.name ?? id,
      sub: info.manifest ? `v${info.manifest.version} · ${id}` : info.dir,
      icon: broken ? '⚠' : iconFor(info),
      accent: pluginAccent(id),
      broken,
      err: info.err,
      badges: broken ? [] : declaredPermissions(info.manifest).map((p) => {
        const r = resolvePermission(p, ex);
        return `${r.icon} ${r.badge}`;
      }),
      enabled: info.enabled,
      rtErr: broken ? null : runtimeErrorFor(id),
    };
  }));

  const installedVersions = $derived<Record<string, string>>(
    Object.fromEntries(
      plugins.filter((p) => p.manifest).map((p) => [p.manifest!.id, p.manifest!.version])
    )
  );

  // filter row: local query state
  let query = $state('');

  // filtered rows — basis for grouping
  const filtered = $derived<Row[]>(
    query.trim()
      ? rows.filter(r => {
          const q = query.toLowerCase();
          return r.name.toLowerCase().includes(q)
            || r.id.toLowerCase().includes(q)
            || r.sub.toLowerCase().includes(q);
        })
      : rows
  );

  // groups: enabled → divider DISABLED → disabled → broken at the end
  const groups = $derived({
    enabled: filtered.filter(r => r.enabled && !r.broken),
    disabled: filtered.filter(r => !r.enabled && !r.broken),
    broken: filtered.filter(r => r.broken),
  });

  // footer counters — from the full list (not the filter)
  const installed = $derived(plugins.length);
  const enabledCount = $derived(plugins.filter(p => p.enabled && !p.err).length);
</script>

<div class="overlay" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label={t('ext.title')} tabindex="-1" use:focusTrap>
    <div class="head">
      <div class="title">{t('ext.title')}</div>
      <div class="hbtns">
        <button class="install" onclick={() => onInstall()}>＋ {t('ext.install')}</button>
        <button class="refresh" title={t('ext.refresh')} aria-label={t('ext.refresh')} onclick={() => onRefresh()}>⟳</button>
        <button class="close" title={t('ext.close')} aria-label={t('ext.close')} onclick={() => onClose()}>✕</button>
      </div>
    </div>

    <div class="tabs" role="tablist">
      <button class="tabbtn" class:active={tab === 'installed'} role="tab" aria-selected={tab === 'installed'}
        onclick={() => (tab = 'installed')}>{t('ext.tabInstalled')}</button>
      <button class="tabbtn" class:active={tab === 'store'} role="tab" aria-selected={tab === 'store'}
        onclick={() => (tab = 'store')}>{t('ext.tabStore')}</button>
    </div>

    {#if tab === 'installed'}
      <!-- Filter row: magnifier + input + results counter -->
      <div class="filter">
        <svg class="mag" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5"/>
          <line x1="20" y1="20" x2="15.6" y2="15.6"/>
        </svg>
        <input
          type="text"
          bind:value={query}
          aria-label={t('ext.filterAria')}
          placeholder={t('ext.filterPlaceholder')}
        />
        <span class="count">{filtered.length}</span>
      </div>

      <div class="list">
        {#if rows.length === 0}
          <div class="empty">{t('ext.emptyNoExtensions')}</div>
        {:else if filtered.length === 0}
          <!-- Filter yielded 0 matches, but plugins exist -->
          <div class="empty">{t('ext.noMatches')}</div>
        {/if}

        {#snippet rowTpl(r: Row, isDisabled: boolean)}
          <div class="row" class:broken={r.broken} class:disabled-row={isDisabled}>
            <button class="row-open" aria-label={t('ext.detailsAria', { name: r.name })} onclick={() => onOpenDetail(r.id)}>
              <span class="ico" class:broken={r.broken} aria-hidden="true" style={`--ic: ${r.broken ? 'var(--red)' : r.accent}`}>{r.icon}</span>
              <span class="meta">
                <span class="name-line"><b>{r.name}</b> <span class="dim">{r.sub}</span></span>
                {#if r.broken}
                  <!-- Broken: red dot + inline error in the meta (S8.5) -->
                  <span class="meta-line">
                    <span class="dot err"></span>
                    <span class="stat err">{t('ext.error')}: {r.err}</span>
                  </span>
                {:else}
                  <!-- Second meta line: status dot + word + badges -->
                  <span class="meta-line">
                    <span class="dot" class:on={r.enabled}></span>
                    <span class="stat" class:on={r.enabled}>{r.enabled ? t('ext.enabled') : t('ext.disabled')}</span>
                    {#if r.badges.length}
                      {#each r.badges as b, i (i)}<span class="badge">{b}</span>{/each}
                    {:else}
                      <span class="dim small">{t('ext.requestsNoPermissions')}</span>
                    {/if}
                  </span>
                {/if}
                {#if r.rtErr}<span class="err">⚠ {t('ext.activationError')}: {r.rtErr}</span>{/if}
              </span>
            </button>
            {#if updates[r.id]}
              <button class="upd-badge" aria-label={t('ext.updateAria', { name: r.name })}
                disabled={busyId === r.id || storeBusyId === r.id} onclick={() => onStoreUpdate(r.id)}>
                {t('ext.updateAvailable')}
              </button>
            {/if}
            <button
              class="toggle"
              class:on={r.enabled && !r.broken}
              role="switch"
              aria-checked={r.enabled && !r.broken}
              aria-label={t('ext.toggleAria', { name: r.name })}
              disabled={r.broken || busyId === r.id}
              onclick={() => onToggle(r.info, !r.enabled)}
            ><span class="knob"></span></button>
            <button
              class="trash"
              aria-label={t('ext.deleteAria', { name: r.name })}
              disabled={busyId === r.id}
              onclick={() => onUninstall(r.info)}
            ><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 7 20 7"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
          </div>
        {/snippet}

        {#each groups.enabled as r (r.info.dir)}
          {@render rowTpl(r, false)}
        {/each}

        {#if groups.disabled.length}
          <!-- Divider before the disabled group -->
          <div class="group-divider">
            <span>{t('ext.disabledGroup')}</span>
            <span class="rule"></span>
          </div>
        {/if}

        {#each groups.disabled as r (r.info.dir)}
          {@render rowTpl(r, true)}
        {/each}

        {#each groups.broken as r (r.info.dir)}
          {@render rowTpl(r, false)}
        {/each}
      </div>

      {#if rows.length > 0}
        <!-- Dialog footer: installed/enabled summary + placeholder link to open the plugins folder -->
        <div class="footer">
          <span class="summary">{t('ext.footerSummary', { installed, enabled: enabledCount })}</span>
          <button
            class="folder"
            aria-label={t('ext.openFolderAria')}
            aria-disabled={!onOpenFolder}
            disabled={!onOpenFolder}
            onclick={() => onOpenFolder?.()}
          >{t('ext.pluginsFolder')} ↗</button>
        </div>
      {/if}
    {:else}
      <StoreTab
        entries={storeEntries}
        stale={storeStale}
        loading={storeLoading}
        error={storeError}
        installed={installedVersions}
        {updates}
        busyId={storeBusyId}
        onOpen={onStoreOpen}
        onInstall={onStoreInstall}
        onUpdate={onStoreUpdate}
        onRefresh={onStoreRefresh}
      />
    {/if}
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; background: #000a; }
  /* Dialog container — Gruvbox style: sharper corners + deep shadow */
  .dialog {
    /* Local shades for the extensions list row */
    --row-hover-bg: #2c2926;
    --row-hover-border: #504945;
    --dot-idle: #5a5450;
    --broken-border: #6b3530;
    background: var(--bg-elevated); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 18px; width: 600px; max-width: 90%; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 20px 56px #0009; font: 13px var(--ui-font);
  }
  .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 13px; }
  .title { font-weight: 700; font-size: 15px; }
  .hbtns { display: flex; gap: 8px; }
  /* Filled install button — accent background */
  .install { background: var(--accent); color: #1a1a1a; border: none; font-weight: 600; border-radius: 5px; padding: 6px 12px; gap: 6px; cursor: pointer; font: inherit; font-size: 12px; }
  .install:hover { filter: brightness(.94); }
  .install:focus-visible { outline: 1px solid var(--accent); outline-offset: 2px; }
  /* Icon buttons refresh/close — neutral style */
  .refresh, .close { background: var(--bg); border: 1px solid var(--border); color: var(--text-dim); border-radius: 5px; padding: 6px 9px; cursor: pointer; font: inherit; }
  .refresh:hover, .close:hover { background: var(--row-hover-bg, var(--active-row)); }
  .refresh:focus-visible, .close:focus-visible { outline: 1px solid var(--accent); outline-offset: 2px; }
  .list { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
  .empty { color: var(--text-dim); font-size: 12px; line-height: 1.5; padding: 24px 8px; text-align: center; }
  .row { display: flex; align-items: center; gap: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 7px; padding: 10px 12px; }
  .row:hover { border-color: var(--row-hover-border); background: var(--row-hover-bg); transition: border-color .1s, background .1s; }
  .row.broken { border-color: var(--broken-border, #6b3530); }
  .row-open { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; background: none; border: none; cursor: pointer; font: inherit; color: inherit; text-align: left; padding: 0; }
  .row-open:hover .name-line b { color: var(--accent); }
  /* icon plate: tint+glyph, color determined by pluginColor */
  .ico { width: 30px; height: 30px; border-radius: 7px; flex: none; display: flex; align-items: center; justify-content: center; font-size: 15px; line-height: 1; color: var(--ic); background: color-mix(in srgb, var(--ic) 14%, transparent); }
  .meta { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .name-line { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .name-line .dim { color: var(--text-faint, var(--text-dim)); font-size: 11.5px; }
  .dim { color: var(--text-dim); }
  .small { font-size: 11px; }
  /* Meta line: status dot + word + badges */
  .meta-line { display: flex; align-items: center; gap: 9px; margin-top: 5px; flex-wrap: wrap; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dot-idle, #5a5450); flex: none; }
  .dot.on { background: var(--green); }
  .stat { font-size: 11px; color: var(--text-faint, var(--text-dim)); }
  .stat.on { color: var(--green); }
  /* Permission badges — on the sidebar background */
  .badge { font-size: 10.5px; background: var(--sidebar); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; color: var(--text-dim); }
  /* Inline error of a broken plugin — inside .meta-line (S8.5) */
  .dot.err { background: var(--red); }
  .stat.err { color: var(--red); }
  /* Separate error line (rtErr, activation error) */
  .err { display: block; margin-top: 4px; font-size: 11px; color: var(--red); }
  /* Rows of the disabled group */
  .row.disabled-row { opacity: .82; }
  /* DISABLED divider between groups */
  .group-divider { display: flex; align-items: center; gap: 9px; margin: 4px 2px 2px; }
  .group-divider span:first-child { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; font-weight: 600; color: var(--text-faint, #7c6f64); }
  .group-divider .rule { flex: 1; height: 1px; background: var(--border); }
  /* Toggle 34×19: knob 15×15, ON offset 17px; knob color — --bg (list, not detail) */
  .toggle { position: relative; width: 34px; height: 19px; flex-shrink: 0; background: var(--border); border: none; border-radius: 10px; cursor: pointer; padding: 0; }
  .toggle.on { background: var(--green); }
  .toggle:disabled { opacity: 0.4; cursor: not-allowed; }
  .knob { position: absolute; top: 2px; left: 2px; width: 15px; height: 15px; background: var(--bg); border-radius: 50%; transition: left 0.12s; }
  .toggle.on .knob { left: 17px; }
  /* Trash: base color --text-faint, hover → red */
  .trash { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; background: none; border: 1px solid transparent; border-radius: var(--radius); cursor: pointer; padding: 3px; color: var(--text-faint); }
  .trash svg { width: 15px; height: 15px; display: block; }
  .trash:hover:not(:disabled) { border-color: var(--red); color: var(--red); }
  .trash:disabled { opacity: 0.4; cursor: not-allowed; }
  /* Filter row (S8.6): magnifier + input + counter */
  .filter { display: flex; align-items: center; gap: 9px; background: var(--sidebar); border: 1px solid var(--border); border-radius: 6px; padding: 7px 11px; margin-bottom: 14px; }
  .filter:focus-within { border-color: var(--accent); }
  .mag { width: 14px; height: 14px; stroke: var(--text-dim); stroke-width: 1.9; stroke-linecap: round; fill: none; flex: none; }
  .filter input { flex: 1; background: none; border: none; color: var(--text); font: inherit; font-size: 12px; outline: none; }
  .filter input::placeholder { color: var(--text-dim); }
  .count { font-size: 10px; color: var(--text-faint); }
  /* Dialog footer: summary + plugins folder link */
  .footer { display: flex; align-items: center; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-faint); }
  .summary { flex: 1; }
  .folder { background: none; border: none; color: var(--text-dim); cursor: pointer; font: inherit; font-size: 11px; padding: 0; }
  .folder:hover:not(:disabled) { color: var(--accent); }
  .folder:disabled { cursor: default; opacity: .6; }
  .tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-top: 10px; }
  .tabbtn {
    background: none; border: none; border-bottom: 2px solid transparent; color: var(--text-dim);
    font: 12px var(--ui-font); padding: 6px 12px; cursor: pointer;
  }
  .tabbtn.active { color: var(--text); border-bottom-color: var(--accent); }
  .upd-badge {
    background: none; border: 1px solid var(--accent); color: var(--accent);
    border-radius: 999px; padding: 2px 10px; font: 11px var(--ui-font); cursor: pointer; white-space: nowrap;
  }
  .upd-badge:disabled { opacity: 0.5; cursor: default; }
</style>
