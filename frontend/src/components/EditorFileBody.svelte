<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { files } from '../bridge/files';
  import { editorBuffers, type EditorBuffer } from '../bridge/editorBuffers.svelte';
  import { editorDirty } from '../bridge/editorDirty.svelte';
  import { mountEditor, type EditorHandle } from '../bridge/editorSetup';
  import { renderMarkdown } from '../bridge/mdPreview';
  import { pendingGoto } from '../bridge/pendingGoto.svelte';
  import { debounce } from '../state/autosave';
  import { t } from '../i18n/index.svelte';
  import type { EditorMode } from '../state/types';

  let { fileId, path, mode = 'source', active = false }:
    { fileId: string; path: string; mode?: EditorMode; active?: boolean } = $props();

  let handle: EditorHandle | undefined;

  // doc — the reactive source of truth for the document: survives any mode switch
  // (fork B3-1). CM6 onChange writes here; preview/split read it. cursor — the last
  // CM6 cursor offset (not reactive — read only on mount/buffer-write).
  let doc = $state('');
  let cursor = 0;
  let loaded = $state(false);
  let loadError = $state<string | null>(null);
  let previewHtml = $state('');

  const isMd = $derived(/\.(md|markdown)$/i.test(path));
  // Segment and preview/split — only for .md; non-md is always source (even if a leaf
  // in layout.json ended up with mode=preview — we degrade safely).
  const effectiveMode = $derived(isMd ? mode : 'source');

  // Debounce the preview render while typing in split (don't run marked on every keystroke).
  const previewDebounced = debounce(() => {
    previewHtml = renderMarkdown(doc);
  }, 80);

  // Debounced-persist of the draft into the Go draft store by fileId (de-risk §3). Guard
  // against resurrection: if ⌘S already cleared dirty — don't write the draft.
  // We take the text from the buffer (onDocChange keeps it fresh), because on flush at
  // unmount action.destroy has already overwritten the reactive `doc` via getDoc().
  const draftDebounced = debounce(() => {
    if (!editorDirty.get(fileId)) return;
    const content = editorBuffers.get(fileId)?.doc ?? doc;
    void files.saveDraft(fileId, path, content);
  }, 400);

  function onDocChange(next: string) {
    doc = next;
    editorDirty.set(fileId, true);
    // Keep the buffer fresh so that ⌘S from App writes the current text of the active file
    // (cursor is refined on unmount; mode — effectiveMode).
    const prev = editorBuffers.get(fileId);
    editorBuffers.set(fileId, {
      path, doc: next, dirty: true, cursor: prev?.cursor ?? cursor, mode: effectiveMode,
    });
    if (effectiveMode === 'split') previewDebounced.schedule();
    draftDebounced.schedule();
  }

  // Jump to a line on a click in the console (Stage C). Idempotent: consume clears
  // the target, a repeated run is harmless. handle is not reactive — we read it at call time.
  function applyPendingGoto() {
    const t = pendingGoto.get(fileId);
    if (t && handle) {
      handle.gotoLine(t.line, t.col);
      pendingGoto.consume(fileId);
    }
  }

  // Instant render on ENTERING preview/split (and right after loading): we read doc via
  // untrack so the effect doesn't rebuild the HTML on every keystroke — the debounce above does that.
  $effect(() => {
    const m = effectiveMode;
    const l = loaded;
    if (l && m !== 'source') {
      previewHtml = renderMarkdown(untrack(() => doc));
    }
  });

  // Live CM6 (fileId did not change — {#key} did not remount): reactively catch
  // the appearance of pendingGoto and jump. consume → the effect reruns with an empty target (no-op).
  $effect(() => {
    if (pendingGoto.get(fileId)) applyPendingGoto();
  });

  // Svelte action: mounts CM6 into the host-div for exactly its lifetime in the DOM. The host-div
  // renders for source|split and NOT for preview → source↔split does NOT recreate the div →
  // CM6 survives (undo/scroll intact). A round-trip through preview recreates CM6 from doc+cursor.
  function cm(node: HTMLElement) {
    handle = mountEditor(node, { doc, path, cursor, onChange: onDocChange });
    if (active) handle.focus(); // focus-on-mount only; runtime focus goes through onFocus/onpointerdown
    applyPendingGoto(); // case of a remounted body (new/activated tab)
    return {
      // Teardown of CM6 when the host-div is removed (entering preview OR unmounting the component): we capture
      // doc/cursor into $state BEFORE destroy, and null out handle. On a full unmount this runs together
      // with onDestroy — order doesn't matter: handle is nulled out here, so onDestroy either
      // reads a live handle (if this destroy hasn't run yet), or the $state doc/cursor.
      destroy() {
        if (handle) {
          doc = handle.getDoc();
          cursor = handle.getCursor();
          handle.destroy();
          handle = undefined;
        }
      },
    };
  }

  onMount(async () => {
    // §9-analog: buffer from the store (if present, key = fileId) otherwise read the file.
    const cached = editorBuffers.get(fileId);
    if (cached) {
      doc = cached.doc;
      cursor = cached.cursor;
      editorDirty.set(fileId, cached.dirty);
    } else {
      try {
        doc = await files.readFile(path);
      } catch (err) {
        loadError = String(err);
        pendingGoto.consume(fileId); // CM6 won't mount (binary/large) — don't accumulate a target
        return;
      }
    }
    loaded = true; // → template renders the host-div (source/split) or preview; the action mounts CM6
  });

  onDestroy(() => {
    draftDebounced.flush();   // persist the unsaved draft (guard inside); NOT cancel
    previewDebounced.cancel();
    // §9-analog unmount: we save the buffer into the store by fileId (do NOT delete) — a remount restores it.
    // handle exists in source/split (we read it live), not in preview (we read $state doc/cursor).
    // mode: effectiveMode — for non-md it degrades to source (intentional: a remount opens source).
    if (handle || loaded) {
      const finalDoc = handle ? handle.getDoc() : doc;
      const finalCursor = handle ? handle.getCursor() : cursor;
      const buf: EditorBuffer = { path, doc: finalDoc, dirty: editorDirty.get(fileId), cursor: finalCursor, mode: effectiveMode };
      editorBuffers.set(fileId, buf);
    }
    handle?.destroy(); // defensive no-op: action.destroy already nulled out handle (CM6 destroy is idempotent)
  });
</script>

{#if loadError}
  <div class="welcome"><div class="wtext">{t('editor.failedOpen')}</div><div class="whint">{loadError}</div></div>
{:else if loaded}
  {#if effectiveMode === 'preview'}
    <!-- previewHtml = renderMarkdown() — DOMPurify-sanitized; the only {@html}, invariant §5.1 -->
    <div class="md preview">{@html previewHtml}</div>
  {:else}
    <div class="edrow" class:split={effectiveMode === 'split'}>
      <div class="editor-host" use:cm></div>
      {#if effectiveMode === 'split'}
        <!-- previewHtml = renderMarkdown() — DOMPurify-sanitized -->
        <div class="md prevpane">{@html previewHtml}</div>
      {/if}
    </div>
  {/if}
{/if}

<style>
  /* source: CM6 fills the whole cell. split: CM6 50% | preview 50% with a 1px divider (B3-3). */
  .edrow { flex: 1; min-height: 0; width: 100%; display: flex; position: relative; z-index: 0; }
  .editor-host { flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
  .editor-host :global(.cm-editor) { height: 100%; }
  .prevpane { flex: 1; min-width: 0; border-left: 1px solid var(--border); }
  .preview { flex: 1; min-height: 0; }
  /* Preview containers (preview across the whole cell / prevpane in split). */
  .md { overflow: auto; padding: 9px 12px; color: var(--text); font: 13px/1.6 var(--ui-font); background: var(--bg); z-index: 0; }
  /* Rendered md ({@html} is not scoped by Svelte → :global). gruvbox-warm. */
  .md :global(h1) { font-size: 18px; font-weight: 700; margin: 2px 0 9px; border-bottom: 1px solid var(--border); padding-bottom: 5px; }
  .md :global(h2) { font-size: 16px; font-weight: 700; margin: 14px 0 7px; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
  .md :global(h3) { font-size: 14px; font-weight: 700; margin: 12px 0 5px; }
  .md :global(p) { margin: 7px 0; color: var(--text); }
  .md :global(ul), .md :global(ol) { margin: 7px 0; padding-left: 20px; color: var(--text); }
  .md :global(li) { margin: 3px 0; }
  .md :global(a) { color: var(--blue, #83a598); text-decoration: underline; }
  .md :global(blockquote) { margin: 9px 0; padding: 3px 11px; border-left: 3px solid var(--accent); color: var(--text-dim); font-style: italic; }
  .md :global(code) { background: var(--bg-elevated); color: #8ec07c; padding: 1px 5px; border-radius: 3px; font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
  .md :global(pre) { background: var(--bg-elevated); padding: 9px 11px; border-radius: var(--radius); overflow: auto; }
  .md :global(pre code) { background: none; padding: 0; }
  .md :global(table) { border-collapse: collapse; margin: 9px 0; }
  .md :global(th), .md :global(td) { border: 1px solid var(--border); padding: 4px 9px; }
  .md :global(img) { max-width: 100%; }
  .welcome { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--text-dim); font: 12px var(--ui-font); padding: 18px; text-align: center; }
  .welcome .wtext { color: var(--text); font-size: 13px; }
  .welcome .whint { font-size: 11px; }
</style>
