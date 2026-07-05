<script lang="ts">
  import { splitHighlight } from './splitHighlight';
  import { t } from '../i18n/index.svelte';

  let {
    message,
    confirmLabel = t('dialog.close'),
    onConfirm,
    onCancel,
    // S9.7: optional props — require no call-site changes in App.svelte (defaults danger/⚠)
    tone = 'danger' as 'danger' | 'accent',
    icon = '⚠',
    highlight = undefined as string | undefined,
  }: {
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    tone?: 'danger' | 'accent';
    icon?: string;
    highlight?: string;
  } = $props();

  // Autofocus the safe (Cancel) button so a stray Enter cancels rather than deletes.
  function autofocus(node: HTMLButtonElement) {
    node.focus();
  }

  // Split the message around the file name for highlighting without {@html} (XSS history §B3)
  const parts = $derived(splitHighlight(message, highlight));
</script>

<div class="overlay" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
  <div class="dialog" role="dialog" aria-modal="true" tabindex="-1">
    <div class="row">
      <span class="chip" class:danger={tone === 'danger'} class:accent={tone === 'accent'} aria-hidden="true">{icon}</span>
      <span class="msg">
        {#if parts}
          {parts.before}<b>{parts.match}</b>{parts.after}
        {:else}
          {message}
        {/if}
      </span>
    </div>
    <div class="buttons">
      <button class="cancel" use:autofocus onclick={() => onCancel()}>{t('dialog.cancel')}</button>
      <button class="confirm" class:accent={tone === 'accent'} onclick={() => onConfirm()}>{confirmLabel}</button>
    </div>
  </div>
</div>

<style>
  /* z-index 115 — confirm is the final confirmation, the topmost modal: it covers the
     "Extensions" screen (z100), InstallDialog (z105) and ConsentDialog (z110). */
  .overlay { position: fixed; inset: 0; z-index: 115; display: flex; align-items: center; justify-content: center; background: #000a; }
  /* S9.1: radius-xl, padding 18px, deepened shadow */
  .dialog { background: var(--bg-elevated); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-xl); padding: 18px; min-width: 280px; max-width: 80%; box-shadow: 0 20px 56px #0009; font: 13px var(--ui-font); }
  /* S9.7: row of chip + message */
  .row { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 16px; }
  /* S9.7: tone icon chip */
  .chip { width: 32px; height: 32px; border-radius: 8px; font-size: 16px; display: flex; align-items: center; justify-content: center; flex: none; }
  .chip.danger { background: rgba(251, 73, 52, .14); color: var(--red); }
  .chip.accent { background: rgba(254, 128, 25, .14); color: var(--accent); font-size: 15px; }
  /* S9.7: message (padding-top aligns it with the icon) */
  .msg { line-height: 1.5; padding-top: 2px; }
  /* S9.7: file name highlight without {@html} — plain bold */
  .msg b { color: var(--text); font-weight: 700; }
  .buttons { display: flex; justify-content: flex-end; gap: 8px; }
  /* S9.1: base buttons — radius-lg; .confirm — border-none, red text #1d2021, padding 7×16 */
  button { border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 7px 15px; cursor: pointer; font: inherit; }
  .cancel { background: var(--bg); color: var(--text); }
  .cancel:hover { background: var(--active-row); }
  .confirm { background: var(--red); color: #1d2021; border: none; padding: 7px 16px; font-weight: 600; }
  .confirm:hover { filter: brightness(1.1); }
  /* S9.7: accent branch (not active in production, covered by a unit test) */
  .confirm.accent { background: var(--accent); color: #1a1a1a; }
</style>
