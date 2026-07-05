<script lang="ts">
  import { COLOR_PRESETS, type ColorValue } from '../state/appearance';
  let { label, value, onPick, dotColor }: {
    label: string;       // EN row label (part of the swatches' aria-label)
    value: string;       // current resolved hex (preset highlight + dot + hex chip)
    onPick: (v: ColorValue) => void;
    dotColor?: string;   // optional indicator dot color; defaults to value
  } = $props();
  const presets = Object.entries(COLOR_PRESETS) as [string, string][];
  const norm = (h: string) => h.toLowerCase();
  // Reference to the hidden color-input — the chip button opens it programmatically (.click())
  let colorInput: HTMLInputElement | undefined = $state();
</script>

<div class="row">
  <div class="row-label">
    <!-- Current-state indicator dot (decorative, color = dotColor ?? value) -->
    <span class="dot" data-testid={`state-dot-${label}`} style:background={dotColor ?? value}></span>
    {label}
  </div>
  <div class="swatches">
    {#each presets as [name, hex] (name)}
      <button
        class="sw" class:sel={norm(hex) === norm(value)}
        style:background={hex}
        aria-label={`${label}: ${name}`} title={name}
        onclick={() => onPick(name)}
      ></button>
    {/each}
  </div>
  <!-- Read-only hex chip = trigger for the hidden color-input; text = current lowercase value -->
  <button class="hex-chip" title="Pick custom color" onclick={() => colorInput?.click()}>{norm(value)}</button>
  <input
    bind:this={colorInput} class="picker" type="color" value={norm(value)}
    aria-label={`${label}: custom hex`} tabindex="-1"
    oninput={(e) => onPick(e.currentTarget.value)}
  />
</div>

<style>
  .row { display: flex; align-items: center; gap: 10px; margin-bottom: 11px; }
  .row-label { width: 118px; font-size: 12.5px; flex: none; display: flex; align-items: center; gap: 7px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
  .swatches { display: flex; gap: 6px; }
  .sw { width: 19px; height: 19px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; box-shadow: 0 0 0 1px var(--border); padding: 0; }
  .sw.sel { border-color: var(--text); }
  .hex-chip { margin-left: auto; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text-dim); font: 11px var(--ui-font); padding: 4px 8px; cursor: pointer; }
  /* Hidden native color-input (visually collapsed, but focused programmatically via the chip) */
  .picker { position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none; border: none; padding: 0; }
</style>
