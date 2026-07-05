<script lang="ts">
  import PaneHeader from './PaneHeader.svelte';
  import EditorFileBody from './EditorFileBody.svelte';
  import { editorDirty } from '../bridge/editorDirty.svelte';
  import { t } from '../i18n/index.svelte';
  import type { EditorFile, EditorMode } from '../state/types';

  let {
    paneId,
    files,
    activeFileId,
    active = false,
    zoomed = false,
    onFocus,
    onSplit,
    onSplitAs,
    onSplitOpenFile,
    onClose,
    onZoom,
    onOpenFile,
    onMakeTerminal,
    onActivateFile,
    onCloseFile,
    onModeChange,
  }: {
    paneId: string;
    files: EditorFile[];
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

  const activeFile = $derived(files.find((f) => f.fileId === activeFileId));
  const isWelcome = $derived(files.length === 0);
  const isMd = $derived(!!activeFile && /\.(md|markdown)$/i.test(activeFile.path));

  const fileTabs = $derived(
    files.map((f) => ({
      fileId: f.fileId,
      name: f.path.split('/').pop() || f.path,
      dirty: editorDirty.get(f.fileId),
      active: f.fileId === activeFileId,
    })),
  );

  // use:-action for autofocus without an attribute (no svelte-ignore)
  function autofocus(node: HTMLElement) {
    node.focus();
  }
</script>

<div
  class="pane"
  class:active
  role="presentation"
  data-pane-id={paneId}
  onpointerdown={() => onFocus?.()}
>
  <PaneHeader
    {paneId}
    {active}
    {zoomed}
    fileTabs={isWelcome ? undefined : fileTabs}
    mode={activeFile?.mode ?? 'source'}
    mdViews={isMd}
    onModeChange={isMd ? onModeChange : undefined}
    {onActivateFile}
    {onCloseFile}
    onAddFile={onOpenFile}
    {onSplit}
    {onSplitAs}
    {onSplitOpenFile}
    {onZoom}
    {onClose}
  />
  {#if isWelcome}
    <div class="welcome">
      <div class="wcards">
        <div class="card">
          <button class="cbtn primary" use:autofocus onclick={() => onMakeTerminal?.()}>
            {t('editor.terminal')}
            <kbd>⏎</kbd>
          </button>
          <div class="cdesc">{t('editor.terminalDesc')}</div>
        </div>
        <div class="card">
          <button class="cbtn" onclick={() => onOpenFile?.()}>
            {t('editor.openFile')}
            <kbd>⌘O</kbd>
          </button>
          <div class="cdesc">{t('editor.openFileDesc')}</div>
        </div>
      </div>
      <div class="whint">{t('editor.dragHint')}</div>
    </div>
  {:else if activeFile}
    {#key activeFile.fileId}
      <EditorFileBody
        fileId={activeFile.fileId}
        path={activeFile.path}
        mode={activeFile.mode}
        {active}
      />
    {/key}
  {/if}
</div>

<style>
  /* Mirror of .pane from TerminalPane: its own stacking context, frame overlay ::before. */
  .pane { position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; box-sizing: border-box; border: 1px solid transparent; isolation: isolate; background: var(--bg); }
  .pane.active::before { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 3; box-shadow: inset 0 0 0 2px var(--accent); }
  /* welcome: two centered cards (variant A) */
  .welcome { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; color: var(--text-dim); font: 12px var(--ui-font, ui-monospace, monospace); padding: 24px; text-align: center; }
  .wcards { display: flex; gap: 16px; }
  .card { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .cbtn { display: flex; align-items: center; gap: 6px; padding: 10px 18px; background: #3a3430; color: var(--text); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font: 13px/1 var(--ui-font, ui-monospace, monospace); transition: background 0.1s; }
  .cbtn:hover, .cbtn:focus { background: #4a4440; outline: none; border-color: var(--accent); }
  .cbtn.primary { border-color: var(--accent); color: var(--accent); }
  .cbtn kbd { font: 11px var(--ui-font); color: var(--text-dim); background: #ffffff0d; padding: 1px 5px; border-radius: 3px; border: 1px solid var(--border); }
  .cdesc { font-size: 10px; color: var(--text-dim); }
  .whint { font-size: 11px; color: var(--text-dim); opacity: 0.65; }
</style>
