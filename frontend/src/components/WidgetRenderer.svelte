<script lang="ts">
  import type { Widget } from '../state/widgets';
  import TextWidget from './widgets/TextWidget.svelte';
  import BadgeWidget from './widgets/BadgeWidget.svelte';
  import ListWidget from './widgets/ListWidget.svelte';
  import ButtonsWidget from './widgets/ButtonsWidget.svelte';
  import TableWidget from './widgets/TableWidget.svelte';
  import ChartWidget from './widgets/ChartWidget.svelte';
  import ColorRowWidget from './widgets/ColorRowWidget.svelte';
  import MeterWidget from './widgets/MeterWidget.svelte';
  import ReorderWidget from './widgets/ReorderWidget.svelte';
  import ToggleWidget from './widgets/ToggleWidget.svelte';
  import SegmentedWidget from './widgets/SegmentedWidget.svelte';
  let { widgets, onCommand = undefined }: { widgets: Widget[]; onCommand?: (command: string, args?: unknown) => void } = $props();
</script>

<div class="widgets">
  {#each widgets as w, i (i)}
    {#if w.type === 'text'}
      <TextWidget {w} />
    {:else if w.type === 'badge'}
      <BadgeWidget {w} />
    {:else if w.type === 'list'}
      <ListWidget {w} {onCommand} />
    {:else if w.type === 'buttons'}
      <ButtonsWidget {w} {onCommand} />
    {:else if w.type === 'table'}
      <TableWidget {w} />
    {:else if w.type === 'chart'}
      <ChartWidget {w} />
    {:else if w.type === 'colorRow'}
      <ColorRowWidget {w} {onCommand} />
    {:else if w.type === 'meter'}
      <MeterWidget {w} />
    {:else if w.type === 'reorder'}
      <ReorderWidget {w} {onCommand} />
    {:else if w.type === 'toggle'}
      <ToggleWidget {w} {onCommand} />
    {:else if w.type === 'segmented'}
      <SegmentedWidget {w} {onCommand} />
    {/if}
  {/each}
</div>

<style>
  .widgets { display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; }
</style>
