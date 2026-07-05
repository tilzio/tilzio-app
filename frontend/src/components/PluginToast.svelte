<script lang="ts">
  import { toasts, dismissToast } from '../bridge/toast.svelte';
  import { toneColor } from '../state/widgets';
  import { t } from '../i18n/index.svelte';
</script>

<div class="toast-stack">
  {#each toasts.items as toast (toast.id)}
    {#if toast.kind === 'action'}
      <!-- T2 actionable toast: persistent, cyan border, LED dot, Open pane / Later buttons -->
      <div class="action-toast">
        <div class="at-head">
          <span class="at-dot"></span>
          <span class="at-title">{toast.title}</span>
          <button
            class="at-x"
            onclick={(e) => { e.stopPropagation(); dismissToast(toast.id); }}
            aria-label={t('plugin.toastDismiss')}
          >✕</button>
        </div>
        {#if toast.body}<div class="at-body">{toast.body}</div>{/if}
        <div class="at-actions">
          {#each toast.actions ?? [] as a}
            <button
              class="at-btn"
              class:primary={a.primary}
              onclick={() => a.onAct()}
            >{a.label}</button>
          {/each}
        </div>
      </div>
    {:else}
      <!-- T1 plugin toast: auto-dismiss, clickable as a whole -->
      <button class="toast" onclick={() => dismissToast(toast.id)} title={t('plugin.toastClose')}>
        <span class="bar" style:background={toast.tone ? toneColor(toast.tone) : 'var(--accent)'}></span>
        {#if toast.icon}<span class="ico" style:color={toast.tone ? toneColor(toast.tone) : 'var(--text-dim)'}>{toast.icon}</span>{/if}
        <span class="body">
          <span class="plug">{toast.pluginId}</span>
          <span class="title">{toast.title}</span>
          {#if toast.body}<span class="msg">{toast.body}</span>{/if}
        </span>
      </button>
    {/if}
  {/each}
</div>

<style>
  .toast-stack {
    /* z-index 200 — notifications ABOVE all modals (Extensions/Settings 100,
       Install 105, Consent 110, Confirm 115), otherwise the toast sits under the
       backdrop of an open dialog: it isn't visible and isn't clickable (the click goes into the modal). */
    position: fixed; right: 16px; bottom: 40px; z-index: 200;
    display: flex; flex-direction: column; gap: 8px; pointer-events: none;
  }
  .toast { pointer-events: auto; cursor: pointer; text-align: left; max-width: 320px; padding: 0; border-radius: 6px; overflow: hidden; background: var(--bg-elevated, #32302f); color: var(--text, #ebdbb2); border: 1px solid var(--border, #504945); font: 12px var(--ui-font, ui-monospace, monospace); box-shadow: 0 4px 12px rgba(0,0,0,0.4); display: flex; align-items: stretch; gap: 0; }
  .bar { width: 3px; flex: none; }
  .ico { display: flex; align-items: flex-start; padding: 10px 0 0 10px; flex: none; }
  .body { display: flex; flex-direction: column; gap: 2px; padding: 9px 11px; min-width: 0; }
  .plug { color: var(--accent); font-size: 10px; }
  .title { font-weight: 500; }
  .msg { color: var(--text-dim); white-space: normal; }

  /* ──── T2 action toast (cyan border, LED dot, buttons) ──── */

  /* Card appearance animation — component-local (tzPop isn't in theme.css) */
  @keyframes tzPop {
    from { opacity: 0; transform: translateY(6px) scale(.98); }
    to   { opacity: 1; transform: none; }
  }

  .action-toast {
    pointer-events: auto;
    width: 300px;
    padding: 11px 12px;
    border-radius: 8px;
    background: var(--bg-elevated, #32302f);
    border: 1px solid var(--cyan, #2bd9c4);
    /* Glow: thin ring + shadow */
    box-shadow: 0 8px 22px rgba(0,0,0,.5), 0 0 0 3px rgba(43,217,196,.12);
    font: 12px var(--ui-font, ui-monospace, monospace);
    text-align: left;
    animation: tzPop .18s ease-out;
  }

  /* Header: LED dot + title + cross button */
  .at-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 7px;
  }

  /* LED dot: color --cyan, pulsing via tzPulseDot (declared in theme.css S0) */
  .at-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--cyan, #2bd9c4);
    flex: none;
    animation: tzPulseDot 1.8s ease-in-out infinite;
  }

  .at-title {
    flex: 1;
    color: var(--text, #ebdbb2);
    font-weight: 600;
    font-size: 12.5px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Close button (✕) — stopPropagation in the handler */
  .at-x {
    color: var(--text-dim);
    font-size: 12px;
    background: none;
    border: none;
    cursor: pointer;
    flex: none;
  }
  .at-x:hover { color: var(--text, #ebdbb2); }

  /* Toast body: "space › pane" context */
  .at-body {
    font-size: 11px;
    color: var(--text-dim);
    margin-bottom: 9px;
  }

  /* Row of action buttons */
  .at-actions {
    display: flex;
    gap: 7px;
  }

  .at-btn {
    background: none;
    color: var(--text-dim);
    border: 1px solid var(--border, #3c3836);
    border-radius: 5px;
    padding: 5px 12px;
    font-size: 11.5px;
    cursor: pointer;
  }
  .at-btn:hover { background: rgba(235,219,178,.06); }

  /* Primary button (Open pane): cyan background, dark text */
  .at-btn.primary {
    background: var(--cyan, #2bd9c4);
    color: #0d2c29;
    border: none;
    font-weight: 600;
  }
  .at-btn.primary:hover { filter: brightness(1.08); }
</style>
