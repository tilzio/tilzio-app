<script lang="ts">
  import type { PermLabel } from '../state/permissionLabels';
  import { t } from '../i18n/index.svelte';
  let { pluginName, pluginId, version, permissions, onConfirm, onCancel }: {
    pluginName: string;
    pluginId: string;
    version: string;
    permissions: PermLabel[];
    onConfirm: () => void;
    onCancel: () => void;
  } = $props();

  // Autofocus the safe button (Esc/Enter won't enable the plugin by accident).
  function autofocus(node: HTMLButtonElement) { node.focus(); }
</script>

<div class="overlay" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label={t('plugin.consentAria')} tabindex="-1">
    <!-- S9.5: header with a 🔌 avatar chip and title/subtitle in flex -->
    <div class="head">
      <div class="avatar" aria-hidden="true">🔌</div>
      <div>
        <div class="title">{t('plugin.consentTitle', { name: pluginName })}</div>
        <div class="sub">{pluginId} · v{version}</div>
      </div>
    </div>

    <div class="section">{t('plugin.consentPermissions')}</div>
    {#if permissions.length}
      <div class="perms">
        {#each permissions as p (p.title)}
          <div class="perm">
            <!-- S9.5: chip with inline style from p.color/p.bg (additive: icon/title/detail/badge untouched) -->
            <span class="ico" aria-hidden="true" style="background:{p.bg};color:{p.color}">{p.icon}</span>
            <div><div class="pt">{p.title}</div><div class="pd">{p.detail}</div></div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="pd">{t('plugin.consentNoPermissions')}</div>
    {/if}

    <!-- S9.5: info note with a ⓘ glyph (no {@html}, no leading ℹ️) -->
    <div class="note">
      <span class="note-ico" aria-hidden="true">ⓘ</span>
      <span>{t('plugin.consentNote')}</span>
    </div>

    <div class="buttons">
      <button class="cancel" use:autofocus onclick={() => onCancel()}>{t('plugin.cancel')}</button>
      <!-- S9.5: Enable button with a dot decoration -->
      <button class="confirm" onclick={() => onConfirm()}>
        <span class="dot" aria-hidden="true"></span>{t('plugin.enable')}
      </button>
    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; z-index: 110; display: flex; align-items: center; justify-content: center; background: #000a; }
  /* S9.1: radius-xl, padding 18px, deeper shadow */
  .dialog { background: var(--bg-elevated); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-xl); padding: 18px; width: 430px; max-width: 86%; box-shadow: 0 20px 56px #0009; font: 13px var(--ui-font); }

  /* S9.5: header — flex with an avatar chip */
  .head { display: flex; gap: 12px; align-items: center; margin-bottom: 6px; }
  .avatar { width: 40px; height: 40px; border-radius: 9px; background: #2a2622; color: var(--text-dim); font-size: 18px; display: flex; align-items: center; justify-content: center; flex: none; }

  .title { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
  /* S9.5: sub — dimmer (text-faint) */
  .sub { color: var(--text-faint); font-size: 12px; margin-bottom: 0; }

  /* S9.5: section — slightly different rhythm and color */
  .section { font-size: 10px; letter-spacing: 1.2px; color: var(--text-faint); margin: 16px 0 11px; }

  .perms { display: flex; flex-direction: column; gap: 10px; }
  /* S9.5: perm — gap 11px */
  .perm { display: flex; gap: 11px; align-items: flex-start; }
  /* S9.5: ico — square 28×28 chip with rounding and inline color from p.color/p.bg */
  .ico { width: 28px; height: 28px; border-radius: 7px; font-size: 14px; display: flex; align-items: center; justify-content: center; flex: none; }
  .pt { font-weight: 600; }
  /* S9.5: pd — margin-top 1px */
  .pd { color: var(--text-dim); font-size: 12px; margin-top: 1px; }

  /* S9.5: note — flex with note-ico (ⓘ) in aqua */
  .note { display: flex; gap: 9px; align-items: flex-start; margin-top: 16px; background: var(--sidebar); border: 1px solid var(--border); border-radius: 7px; padding: 10px 12px; font-size: 11.5px; color: var(--text-dim); line-height: 1.5; }
  .note-ico { color: var(--aqua); flex: none; }

  .buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
  /* S9.1: base buttons — radius-lg; .confirm — border-none, padding 7×16 */
  button { border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 7px 15px; cursor: pointer; font: inherit; }
  .cancel { background: var(--bg); color: var(--text); }
  .cancel:hover { background: var(--active-row); }
  /* S9.5: confirm — flex with a dot decoration */
  .confirm { background: var(--accent); color: #1d2021; border: none; padding: 7px 16px; font-weight: 600; display: inline-flex; align-items: center; gap: 7px; }
  .confirm:hover { filter: brightness(1.08); }
  /* S9.5: dot on the Enable button */
  .dot { width: 6px; height: 6px; border-radius: 50%; background: #1a1a1a; flex: none; }
</style>
