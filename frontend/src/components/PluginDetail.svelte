<script lang="ts">
  import type { PluginInfo, StorageInfo } from '../bridge/plugins';
  import { declaredPermissions, resolvePermission, type PermLabel } from '../state/permissionLabels';
  import { parseContributes } from '../state/pluginContributions';
  import { pluginAccent } from '../state/pluginColor';
  import { focusTrap } from './focusTrap';
  import { t } from '../i18n/index.svelte';

  let { info, storage, runtimeError = null, busy = false, onToggle, onUninstall, onReset, onBack }: {
    info: PluginInfo;
    storage: StorageInfo | null;
    runtimeError?: string | null;
    busy?: boolean;
    onToggle: (on: boolean) => void;
    onUninstall: () => void;
    onReset: () => void;
    onBack: () => void;
  } = $props();

  const m = $derived(info.manifest);
  const broken = $derived(!!info.err);
  const id = $derived(m?.id ?? info.dir);
  const name = $derived(m?.name ?? info.dir);
  const perms = $derived<PermLabel[]>(
    broken ? [] : declaredPermissions(m).map((p) => resolvePermission(p, m?.exec ?? []))
  );
  // Glyph for the identity badge: the Activity Bar icon from the manifest or a default
  const icon = $derived(broken ? '⚠' : (parseContributes(m?.contributes).activityBar[0]?.icon || '🧩'));
  // Badge accent color: red for broken ones, otherwise deterministic by id
  const accent = $derived(broken ? 'var(--red)' : pluginAccent(id));
  // Helper: «1 item» / «N items» without the «(s)» suffix
  function nItems(n: number): string { return n === 1 ? t('ext.oneItem') : t('ext.nItems', { n }); }

  // Human-readable list of contributions from manifest.contributes.
  // Format: dash instead of a colon; statusBar/breadcrumb — «N item(s)» → «N items/1 item».
  const contribLines = $derived<string[]>((() => {
    if (broken) return [];
    const c = parseContributes(m?.contributes);
    const out: string[] = [];
    for (const a of c.activityBar) out.push(t('ext.contribActivityBar', { icon: a.icon, label: a.title || a.id }));
    for (const p of c.panels) out.push(t('ext.contribPanel', { location: p.location === 'right' ? t('ext.locationRight') : t('ext.locationBottom'), label: p.title || p.id }));
    if (c.statusBar.length) out.push(t('ext.contribStatusBar', { items: nItems(c.statusBar.length) }));
    if (c.breadcrumb.length) out.push(t('ext.contribBreadcrumb', { items: nItems(c.breadcrumb.length) }));
    return out;
  })());

  // Focus on «← Back» (the safe target) on open — an accidental Enter doesn't
  // toggle/delete the plugin (like Cancel in ConfirmDialog/Consent).
  function autofocus(node: HTMLButtonElement) { node.focus(); }
</script>

<div class="overlay" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onBack(); }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label={t('ext.extensionAria', { name })} tabindex="-1" use:focusTrap>
    <!-- Back: quiet text link at the top (Variant 2) -->
    <div class="backbar">
      <button class="back" use:autofocus onclick={() => onBack()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
        {t('ext.back')}
      </button>
    </div>

    <!-- Identity block: badge + name/id + actions (status/toggle/delete) on one line -->
    <div class="identity">
      <span class="ico" aria-hidden="true" style={`--ic: ${accent}`}>{icon}</span>
      <div class="ident-meta">
        <div class="title">{name} {#if m}<span class="ver">v{m.version}</span>{/if}</div>
        <div class="sub">{id}</div>
      </div>
      <div class="hactions">
        {#if !broken}
          <!-- Status: dot + text (instead of a pill) -->
          <span class="dot" class:on={info.enabled}></span>
          <span class="stat" class:on={info.enabled}>{info.enabled ? t('ext.enabled') : t('ext.disabled')}</span>
          <button
            class="toggle" class:on={info.enabled}
            role="switch" aria-checked={info.enabled} aria-label={t('ext.toggleAria', { name })}
            disabled={busy} onclick={() => onToggle(!info.enabled)}
          ><span class="knob"></span></button>
        {:else}
          <!-- Broken plugin: red dot + error -->
          <span class="dot err"></span>
          <span class="stat err">{t('ext.error')}</span>
          <button class="toggle" aria-label={t('ext.toggleAria', { name })} disabled={true}><span class="knob"></span></button>
        {/if}
        <button class="trash" aria-label={t('ext.deleteAria', { name })} disabled={busy} onclick={() => onUninstall()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 7 20 7"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
      </div>
    </div>

    {#if runtimeError}<div class="err">⚠ {t('ext.activationError')}: {runtimeError}</div>{/if}

    {#if broken}
      <div class="section"><div class="sec-title">{t('ext.sectionError')}</div><div class="err">{info.err}</div></div>
    {:else}
      <div class="section">
        <div class="sec-title">{t('ext.sectionPermissions')}</div>
        {#if perms.length}
          {#each perms as p (p.title)}
            <div class="perm"><span class="p-ico" aria-hidden="true">{p.icon}</span><div><b>{p.title}</b><div class="dim">{p.detail}</div></div></div>
          {/each}
        {:else}
          <div class="dim">{t('ext.requestsNoPermissions')}</div>
        {/if}
      </div>

      <div class="section">
        <div class="sec-title">{t('ext.sectionContributes')}</div>
        {#if contribLines.length}
          {#each contribLines as line, i (i)}
            <!-- Marker dot in the plugin accent color to the left of each contribution line -->
            <div class="contrib"><span class="dot" style={`--ic: ${accent}`}></span>{line}</div>
          {/each}
        {:else}
          <div class="dim">{t('ext.contributesNothing')}</div>
        {/if}
      </div>

      <div class="section">
        <div class="sec-title">{t('ext.sectionData')}</div>
        {#if storage}
          <!-- Numbers accented with --text, words inherit the --text-faint base; textContent intact for tests -->
          <div class="data-row"><span class="num">{storage.keys}</span> {t('ext.keys')} · <span class="num">{storage.bytes}</span> {t('ext.bytes')}</div>
        {:else}
          <div class="dim">—</div>
        {/if}
        <button class="reset" disabled={busy} onclick={() => onReset()}>↺ {t('ext.resetToDefaults')}</button>
        <div class="dim small">{t('ext.resetDescription')}</div>
      </div>
    {/if}

    <div class="section">
      <div class="sec-title">{t('ext.sectionPath')}</div>
      <div class="path">{info.dir}</div>
    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; background: #000a; }
  /* Sync the container style with ExtensionsScreen: sharp corners + deep shadow */
  .dialog { background: var(--bg-elevated); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 18px; width: 600px; max-width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 20px 56px #0009; font: 13px var(--ui-font); }
  /* Back: quiet text link at the top (Variant 2) — no border, accent color */
  .backbar { margin-bottom: 12px; }
  .back { display: inline-flex; align-items: center; gap: 3px; padding: 2px 0; border: none; background: none; color: var(--accent); cursor: pointer; font: inherit; font-size: 12px; }
  .back svg { width: 14px; height: 14px; }
  .back:hover { text-decoration: underline; }
  /* Actions on the right of the name row; margin-left:auto pins them to the right edge of identity */
  .hactions { display: flex; align-items: center; gap: 10px; margin-left: auto; flex: none; }
  /* Identity block: 42×42 icon badge + meta on the right. mb 16 = +10px of breathing room before the first section (mockup) */
  .identity { display: flex; align-items: center; gap: 13px; margin-bottom: 16px; }
  .identity .ico { width: 42px; height: 42px; border-radius: var(--radius-xl); flex: none; display: flex; align-items: center; justify-content: center; font-size: 20px; line-height: 1; color: var(--ic); background: color-mix(in srgb, var(--ic) 14%, transparent); }
  /* Name meta stretches (flex:1), pushing the actions to the right; long names/ids are clipped */
  .ident-meta { flex: 1; min-width: 0; }
  .title { font-weight: 700; font-size: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ver { color: var(--text-faint); font-weight: 400; font-size: 13px; }
  .sub { color: var(--text-faint); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* Section rhythm: slightly larger padding (13px instead of 12) */
  .section { border-top: 1px solid var(--border); padding: 13px 0; }
  /* Section titles: 10px/uppercase/600 — Tilzio Gruvbox handoff */
  .sec-title { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; font-weight: 600; color: var(--text-faint); margin-bottom: 9px; }
  .perm { display: flex; align-items: flex-start; gap: 9px; margin-bottom: 8px; }
  .perm .dim { margin-top: 1px; }
  .p-ico { font-size: 15px; line-height: 1.2; }
  /* Contribution line: flex with a marker dot on the left */
  .contrib { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  /* Marker dot in CONTRIBUTES: accent color via --ic (CSS custom property) */
  .contrib .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--ic); flex: none; }
  .dim { color: var(--text-dim); }
  .small { font-size: 11px; margin-top: 4px; }
  .path { font-size: 12px; word-break: break-all; color: var(--text-dim); }
  .err { color: var(--red); font-size: 12px; }
  /* DATA: numbers brighter (--text), words via --text-faint inheritance */
  .data-row { color: var(--text-faint); }
  .data-row .num { color: var(--text); }
  /* Status dot in the header — the canonical --idle token (S0), not hardcoded (--dot-idle is scoped in ExtensionsScreen and isn't inherited here) */
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--idle); flex-shrink: 0; }
  .dot.on { background: var(--green); }
  .dot.err { background: var(--red); }
  /* Status text next to the dot */
  .stat { font-size: 11px; color: var(--text-faint); }
  .stat.on { color: var(--green); }
  .stat.err { color: var(--red); }
  /* Toggle 34×19: knob 15×15, ON offset 17px; knob color — --bg-elevated (detail page) */
  .toggle { position: relative; width: 34px; height: 19px; flex-shrink: 0; background: var(--border); border: none; border-radius: 10px; cursor: pointer; padding: 0; }
  .toggle.on { background: var(--green); }
  .toggle:disabled { opacity: 0.4; cursor: not-allowed; }
  .knob { position: absolute; top: 2px; left: 2px; width: 15px; height: 15px; background: var(--bg-elevated); border-radius: 50%; transition: left 0.12s; }
  .toggle.on .knob { left: 17px; }
  /* Trash: SVG, base color --text-faint, hover → red */
  .trash { display: inline-flex; align-items: center; justify-content: center; background: none; border: 1px solid transparent; border-radius: var(--radius); cursor: pointer; padding: 3px; color: var(--text-faint); }
  .trash svg { width: 15px; height: 15px; display: block; }
  .trash:hover:not(:disabled) { border-color: var(--red); color: var(--red); }
  .trash:disabled { opacity: 0.4; cursor: not-allowed; }
  /* Reset: fixed 5px radius (design handoff), 10px margin on top/6px on bottom */
  .reset { margin: 10px 0 6px; background: none; border: 1px solid var(--accent); color: var(--accent); border-radius: 5px; padding: 6px 12px; cursor: pointer; font: inherit; font-size: 12px; }
  .reset:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .reset:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
