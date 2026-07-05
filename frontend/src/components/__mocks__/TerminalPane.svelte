<script lang="ts">
  let {
    paneId,
    active = false,
    zoomed = false,
    onFocus,
    onZoom,
  }: {
    paneId: string;
    cwd?: string;
    active?: boolean;
    zoomed?: boolean;
    onFocus?: () => void;
    onSplit?: (dir: 'h' | 'v') => void;
    onClose?: () => void;
    onZoom?: () => void;
  } = $props();
</script>

<div data-pane-id={paneId} class:active role="presentation" onpointerdown={() => onFocus?.()}>
  <button aria-label="zoom" onclick={() => onZoom?.()}>{zoomed ? 'Z' : 'z'}</button>
</div>
