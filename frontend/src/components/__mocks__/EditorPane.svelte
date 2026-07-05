<script lang="ts">
  import type { EditorFile, EditorMode } from '../../state/types';

  let {
    paneId,
    files = [],
    activeFileId,
    active = false,
    zoomed = false,
    onFocus,
    onZoom,
    onSplitAs,
    onSplitOpenFile,
    onOpenFile,
    onActivateFile,
    onCloseFile,
    onMakeTerminal,
  }: {
    paneId: string;
    files?: EditorFile[];
    activeFileId?: string;
    active?: boolean;
    zoomed?: boolean;
    onFocus?: () => void;
    onSplit?: (dir: 'h' | 'v') => void;
    onSplitAs?: (dir: 'h' | 'v') => void;
    onSplitOpenFile?: (dir: 'h' | 'v') => void;
    onClose?: () => void;
    onZoom?: () => void;
    onOpenFile?: () => void;
    onMakeTerminal?: () => void;
    onActivateFile?: (fileId: string) => void;
    onCloseFile?: (fileId: string) => void;
    onModeChange?: (mode: EditorMode) => void;
  } = $props();
</script>

<div
  data-pane-id={paneId}
  data-pane-kind="editor"
  data-active-file-id={activeFileId}
  data-file-count={files.length}
  class:active
  role="presentation"
  onpointerdown={() => onFocus?.()}
>
  <button aria-label="zoom" onclick={() => onZoom?.()}>{zoomed ? 'Z' : 'z'}</button>
  <button aria-label="split-as-v" onclick={() => onSplitAs?.('v')}>split-as-v</button>
  <button aria-label="split-open-v" onclick={() => onSplitOpenFile?.('v')}>split-open-v</button>
  <button aria-label="open-file-here" onclick={() => onOpenFile?.()}>open-file-here</button>
  <button aria-label="activate-file" onclick={() => onActivateFile?.('test-fid')}>activate-file</button>
  <button aria-label="close-file" onclick={() => onCloseFile?.('test-fid')}>close-file</button>
  <button aria-label="make-terminal" onclick={() => onMakeTerminal?.()}>make-terminal</button>
</div>
