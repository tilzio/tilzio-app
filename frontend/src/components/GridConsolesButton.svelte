<script lang="ts">
  // ⊞ button in the bar → popover: «columns × rows» fields + a live 3×3 picker.
  // Emits raw (cols, rows); the final clamp is in the gridConsoles reducer.
  import { t } from '../i18n/index.svelte';

  let { onSubmit }: { onSubmit: (cols: number, rows: number) => void } = $props();

  let open = $state(false);
  let cols = $state(2);
  let rows = $state(2);
  let hoverC = $state(-1);
  let hoverR = $state(-1);
  let rootEl: HTMLElement | undefined;

  const dispCols = $derived(hoverC >= 0 ? hoverC + 1 : cols);
  const dispRows = $derived(hoverR >= 0 ? hoverR + 1 : rows);

  const cells = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => ({ c, r })));
  function isOn(c: number, r: number): boolean { return c < dispCols && r < dispRows; }

  function close() { open = false; hoverC = -1; hoverR = -1; }
  function toggle() { open ? close() : (open = true); }
  function submit() { onSubmit(cols, rows); close(); }

  function onCellEnter(c: number, r: number) { hoverC = c; hoverR = r; cols = c + 1; rows = r + 1; }
  function onCellClick(c: number, r: number) { cols = c + 1; rows = r + 1; submit(); }
  function onPickerLeave() { hoverC = -1; hoverR = -1; }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  function onWindowDown(e: PointerEvent) {
    if (rootEl && !rootEl.contains(e.target as Node)) close();
  }
  $effect(() => {
    if (!open) return;
    window.addEventListener('pointerdown', onWindowDown, true);
    return () => window.removeEventListener('pointerdown', onWindowDown, true);
  });
</script>

<div class="gc" bind:this={rootEl}>
  <button class="grid-btn" aria-label={t('breadcrumb.gridConsoles')} title={t('breadcrumb.gridConsoles')} onclick={toggle}>⊞</button>
  {#if open}
    <div class="pop" role="dialog" aria-label={t('breadcrumb.gridConsoles')}>
      <div class="fields">
        <label>{t('breadcrumb.columns')} <input aria-label={t('breadcrumb.columns')} type="number" min="1" max="6" bind:value={cols} onkeydown={onKey}></label>
        <label>{t('breadcrumb.rows')} <input aria-label={t('breadcrumb.rows')} type="number" min="1" max="6" bind:value={rows} onkeydown={onKey}></label>
      </div>
      <div class="picker" role="grid" tabindex="-1" onpointerleave={onPickerLeave}>
        {#each cells as cell (cell.r * 3 + cell.c)}
          <button
            class="pk"
            class:on={isOn(cell.c, cell.r)}
            role="gridcell"
            aria-label={`${cell.c + 1}×${cell.r + 1}`}
            onpointerenter={() => onCellEnter(cell.c, cell.r)}
            onclick={() => onCellClick(cell.c, cell.r)}
          ></button>
        {/each}
      </div>
      <div class="cap">{dispCols} × {dispRows} → {dispCols * dispRows}</div>
    </div>
  {/if}
</div>

<style>
  .gc { position: relative; display: inline-flex; }
  .grid-btn {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent);
    border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
    border-radius: var(--radius);
    padding: 2px 8px; font: inherit; line-height: 1; cursor: pointer; font-weight: 700;
  }
  .grid-btn:hover { background: color-mix(in srgb, var(--accent) 24%, transparent); }
  .pop {
    position: absolute; top: calc(100% + 6px); right: 0; z-index: 20;
    background: var(--breadcrumb); border: 1px solid var(--border); border-radius: var(--radius-lg);
    padding: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.45); width: 200px;
    font: 12px var(--ui-font); color: var(--text);
  }
  .fields { display: flex; gap: 6px; justify-content: center; color: var(--text-dim); margin-bottom: 10px; }
  .fields label { display: inline-flex; align-items: center; gap: 4px; }
  .fields input {
    width: 34px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius);
    color: var(--text); font: inherit; text-align: center; padding: 3px 0;
  }
  .fields input:focus { outline: none; border-color: var(--accent); }
  .picker { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .pk { aspect-ratio: 1; background: var(--bg); border: 1px solid var(--border); border-radius: 3px; cursor: pointer; padding: 0; }
  .pk.on { background: color-mix(in srgb, var(--accent) 30%, var(--bg)); border-color: var(--accent); }
  .cap { text-align: center; color: var(--accent); font-weight: 700; margin-top: 8px; }
</style>
