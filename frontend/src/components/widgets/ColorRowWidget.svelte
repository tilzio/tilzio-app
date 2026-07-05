<script lang="ts">
  import ColorRow from '../ColorRow.svelte';
  import { resolveColor, type ColorValue } from '../../state/appearance';
  import type { Widget } from '../../state/widgets';
  let { w, onCommand }: { w: Extract<Widget, { type: 'colorRow' }>; onCommand?: (command: string, args?: unknown) => void } = $props();
  const FALLBACK = '#888888';
  // ColorRow.onPick returns a preset name OR hex; resolve to hex and send it in the command string
  // (args in the right column don't round-trip).
  function pick(v: ColorValue) {
    onCommand?.(w.command + ':' + resolveColor(v, FALLBACK));
  }
</script>

<ColorRow label={w.label ?? ''} value={resolveColor(w.value, FALLBACK)} onPick={pick} />
