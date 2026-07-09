<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import { WebglAddon } from '@xterm/addon-webgl';
  import '@xterm/xterm/css/xterm.css';
  import { coreBridge } from '../bridge/core';
  import { ptyEvents, isAlreadySpawnedError } from '../bridge/ptyEvents';
  import { paneRestart } from '../bridge/paneRestart';
  import { touchedPanes } from '../bridge/touchedPanes';
  import { alerts, clearAlerts } from '../bridge/alerts.svelte';
  import { clearExited } from '../bridge/exitedPanes.svelte';
  import { matchPaths, resolvePath, parseOsc7 } from '../bridge/pathLinks';
  import { linkCwd, linkHome, checkPathExists } from '../bridge/linkResolve';
  import PaneHeader from './PaneHeader.svelte';
  import { MIN_PANE_PX } from '../state/paneGeometry';

  let {
    paneId,
    cwd = '',
    title,
    active = false,
    zoomed = false,
    fontSize = 13,
    onFocus,
    onSplit,
    onClose,
    onZoom,
    onRename,
    onOpenPath,
  }: {
    paneId: string;
    cwd?: string;
    title?: string;
    active?: boolean;
    zoomed?: boolean;
    fontSize?: number;
    onFocus?: () => void;
    onSplit?: (dir: 'h' | 'v') => void;
    onClose?: () => void;
    onZoom?: () => void;
    onRename?: (title: string) => void;
    onOpenPath?: (path: string, line?: number, col?: number) => void;
  } = $props();

  let host: HTMLDivElement;
  let paneEl: HTMLDivElement;
  let term: Terminal;
  let fit: FitAddon;
  let resizeObs: ResizeObserver | undefined;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  let linkDisposable: { dispose(): void } | undefined;
  let oscDisposable: { dispose(): void } | undefined;

  // Exit code of the pane's shell, or null while it is running. When set, the
  // dim restart overlay is shown (design §12.3).
  let exited = $state<number | null>(null);

  const alerted = $derived((alerts.counts[paneId] ?? 0) > 0);

  // Process tag of the pane (foreground name or shell basename). Runtime data, NOT
  // persisted. Updated on mount + when the pane becomes active (without
  // aggressive polling — §9, the method only reads).
  let shellTag = $state('');
  $effect(() => {
    if (active) coreBridge.shellTag(paneId).then((t) => { shellTag = t; }).catch(() => {});
  });

  let canSplitV = $state(true);
  let canSplitH = $state(true);
  const SPLIT_MIN_PX = 2 * MIN_PANE_PX; // below this, a split along the axis would produce sub-minimal children

  // DEC private modes a replayed TUI can leave stuck ON in persisted scrollback —
  // reset after replay (see the scrollback block in onMount). Mouse tracking
  // (1000/1002/1003/1006) plus its 1005/1015 encoding variants. Bracketed paste
  // (2004) is deliberately excluded — the shell re-arms it each prompt and it is wanted.
  const RESET_STICKY_MOUSE = '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1005l\x1b[?1006l\x1b[?1015l';

  function measurePane() {
    if (!paneEl) return;
    canSplitV = paneEl.clientWidth >= SPLIT_MIN_PX;
    canSplitH = paneEl.clientHeight >= SPLIT_MIN_PX;
  }

  function safeFit() {
    if (host && host.offsetWidth > 0 && host.offsetHeight > 0) fit.fit();
  }

  // Focusing the console clears its alerts (design §1). onDestroy does NOT clear —
  // moving/repairing the pane must not lose the counter (clearing happens on close, in App).
  $effect(() => { if (active) clearAlerts(paneId); });

  // Re-fit when this pane's zoom state flips. Zoom resizes the pane via sibling
  // display:none; the ResizeObserver alone misses that transition, leaving the
  // grid at its old size in the corner (design §4). Fit on the next frame, once
  // the new layout is applied. Guarded until the terminal exists (onMount is async)
  // and skipped if the pane has since unmounted.
  $effect(() => {
    zoomed; // track the prop so this re-runs on every zoom toggle
    if (!term || !fit) return;
    requestAnimationFrame(() => {
      if (!host?.isConnected) return;
      safeFit();
      coreBridge.resize(paneId, term.cols, term.rows).catch(() => {});
    });
  });

  // Terminal font size change (setting): recompute cells + refit + resize PTY.
  // §9: only render options, PTY/scrollback/spawn intact.
  // Read fontSize on the FIRST line (like `zoomed` above) — otherwise on the first run
  // (onMount has not yet assigned term → exit by guard) the effect will NOT subscribe to fontSize
  // and will not re-run when the setting changes.
  $effect(() => {
    const fs = fontSize; // track BEFORE guard
    if (!term || !fit) return;
    term.options.fontSize = fs;
    requestAnimationFrame(() => {
      if (!host?.isConnected) return;
      safeFit();
      coreBridge.resize(paneId, term.cols, term.rows).catch(() => {});
    });
  });

  // Restart the shell after it exited: spawn again in the leaf's cwd, mark live,
  // hide the overlay. The terminal buffer is NOT cleared — old output stays above
  // the fresh prompt (design §12.3). No-op while live, so ⌘R on a healthy pane is
  // harmless.
  async function restart() {
    if (exited === null) return;
    try {
      await coreBridge.spawn(paneId, cwd, term.cols, term.rows);
      ptyEvents.markLive(paneId);
      exited = null;
      clearExited(paneId); // mirror exitedPanes in sync with resetting the local exited
    } catch (err) {
      term.write(`\r\n\x1b[31m[failed to restart shell: ${err}]\x1b[0m\r\n`);
    }
  }

  // Own the clipboard copy path. The native macOS "Copy" (⌘C / Edit-menu `copy:`)
  // serialises the terminal selection through a path that re-encodes its UTF-8
  // bytes as Mac OS Roman, so copied Cyrillic (and any non-Latin text) pastes as
  // mojibake even though it renders correctly on screen. Put xterm's selection —
  // already a proper Unicode JS string — on the clipboard ourselves and cancel the
  // broken native serialisation. Document-level + capture phase so we intercept the
  // event wherever it originates (xterm's own copy handler is on the `.xterm`
  // element and misses it when the native menu targets the document). Guarded by
  // hasSelection() so only the pane with an active selection responds and copies
  // from inputs/the editor elsewhere in the app are left untouched.
  function onCopy(e: ClipboardEvent) {
    if (!term?.hasSelection?.()) return;
    const sel = term.getSelection();
    if (!sel) return;
    e.clipboardData?.setData('text/plain', sel);
    e.preventDefault();
  }

  onMount(async () => {
    term = new Terminal({ fontSize, cursorBlink: true, fontFamily: 'ui-monospace, monospace' });
    fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL unavailable / context limit — xterm falls back to its default renderer.
    }
    safeFit();

    // Correctly-encoded copy for terminal selections (see onCopy). Capture phase.
    document.addEventListener('copy', onCopy, true);

    // §9 mount: replay scrollback → register handler → spawn if not already live.
    try {
      const sb = await coreBridge.loadScrollback(paneId);
      if (sb.length) {
        term.write(sb);
        // Replayed scrollback is raw PTY bytes and can carry unbalanced DEC private
        // mode SETs left by a TUI that was running when the session was persisted
        // (e.g. Claude Code / vim enabling mouse tracking, then the app closed before
        // the matching reset was written). Without this the fresh shell prompt stays
        // in mouse-reporting mode: drag-select breaks and mouse motion leaks as
        // `<…M` on the command line. Reset those modes right after the replay; any
        // program that needs them re-enables on its own.
        term.write(RESET_STICKY_MOUSE);
      }
    } catch {
      // No persisted scrollback — normal for a fresh pane.
    }

    ptyEvents.register(
      paneId,
      (bytes) => term.write(bytes),
      (code) => {
        term.write(`\r\n\x1b[2m[exited (code ${code})]\x1b[0m\r\n`);
        exited = code;
      },
    );
    // ⌘R restarts the active exited pane via this registry (design §12.3).
    paneRestart.register(paneId, restart);

    if (!ptyEvents.isLive(paneId)) {
      try {
        await coreBridge.spawn(paneId, cwd, term.cols, term.rows);
        ptyEvents.markLive(paneId);
        clearExited(paneId); // clear the exited flag on a normal spawn in onMount
      } catch (err) {
        // A webview reload (e.g. wails3 dev hot-reload) reset the JS liveSet
        // while Go still holds this pane's session → spawn returns
        // ErrAlreadySpawned. The session is live (output flows via pty:output,
        // scrollback was just replayed above), so reattach: mark it live and
        // fall through to wire input/links/resize. Any OTHER error is a real
        // start failure — show it and bail (input wiring would be pointless).
        if (isAlreadySpawnedError(err)) {
          ptyEvents.markLive(paneId);
          clearExited(paneId); // clear the exited flag on reattach (webview reload)
        } else {
          term.write(`\r\n\x1b[31m[failed to start shell: ${err}]\x1b[0m\r\n`);
          return;
        }
      }
    }

    // Initial process tag (foreground/fallback). §9: read-only.
    coreBridge.shellTag(paneId).then((t) => { shellTag = t; }).catch(() => {});

    term.onData((data) => {
      touchedPanes.mark(paneId);
      coreBridge.write(paneId, data).catch(() => {});
    });

    // §9: only ADD the link provider + OSC7 tracker; PTY/scrollback/spawn intact.
    // The leaf's starting cwd — fallback for relative paths and the source of home.
    if (cwd) { linkCwd.set(paneId, cwd); linkHome.setFrom(cwd); }

    oscDisposable = term.parser.registerOscHandler(7, (data: string) => {
      const abs = parseOsc7(data);
      if (abs) { linkCwd.set(paneId, abs); linkHome.setFrom(abs); }
      return false; // don't "consume" it — let other handlers see it too
    });

    linkDisposable = term.registerLinkProvider({
      provideLinks(bufferLineNumber: number, cb: (links: any[] | undefined) => void) {
        const buf = term.buffer.active;
        const ln = buf.getLine(bufferLineNumber - 1);
        const text = ln ? ln.translateToString(true) : '';
        const cands = matchPaths(text);
        if (!cands.length) { cb(undefined); return; }
        const ctx = { cwd: linkCwd.get(paneId) ?? null, home: linkHome.get() };
        void Promise.all(
          cands.map(async (c) => {
            const abs = resolvePath(c.path, ctx);
            if (!abs || !(await checkPathExists(abs))) return null;
            return {
              // xterm columns 1-based; matchPaths indices 0-based.
              range: { start: { x: c.start + 1, y: bufferLineNumber }, end: { x: c.end, y: bufferLineNumber } },
              text: text.slice(c.start, c.end),
              activate: () => onOpenPath?.(abs, c.line, c.col),
            };
          }),
        ).then((links) => cb(links.filter(Boolean) as any[]));
      },
    });

    measurePane();
    resizeObs = new ResizeObserver(() => {
      measurePane();
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        safeFit();
        coreBridge.resize(paneId, term.cols, term.rows).catch(() => {});
      }, 80);
    });
    resizeObs.observe(paneEl);
  });

  onDestroy(() => {
    clearTimeout(resizeTimer);
    document.removeEventListener('copy', onCopy, true);
    resizeObs?.disconnect();
    ptyEvents.unregister(paneId);
    paneRestart.unregister(paneId);
    // §9 unmount: NO kill — the Go session stays alive and keeps buffering into
    // the back-ring; remounting replays + reattaches without re-spawning.
    linkDisposable?.dispose();
    oscDisposable?.dispose();
    linkCwd.delete(paneId);
    term?.dispose();
  });

  function stop(fn?: () => void) {
    return (e: Event) => {
      e.stopPropagation();
      fn?.();
    };
  }

  // Focus the restart button when the overlay appears so ↵ activates it natively.
  function autofocus(node: HTMLButtonElement) {
    node.focus();
  }
</script>

<div class="pane" class:active class:alerted class:exited={exited !== null} role="presentation" data-pane-id={paneId} bind:this={paneEl} onpointerdown={() => onFocus?.()}>
  <PaneHeader {paneId} {title} {cwd} {active} {alerted} exited={exited !== null} {zoomed} {shellTag} {canSplitV} {canSplitH} {onSplit} {onZoom} {onClose} {onRename} onRestart={restart} />
  <div class="terminal-host" bind:this={host}></div>
  <div class="pane-gap"></div>
  {#if exited !== null}
    <div class="exit-overlay">
      <div class="exit-text">exited (code {exited})</div>
      <div class="exit-hint">↵ / ⌘R — restart</div>
      <button class="exit-restart" use:autofocus onclick={stop(restart)}>Restart</button>
    </div>
  {/if}
</div>

<style>
  /* isolation: isolate makes .pane its own stacking context so .terminal-host's
     z-index:0 confines all of xterm's internal layers (z-index 5–11 in xterm.css)
     beneath the exit-overlay (z-index:1) and PaneHeader (z-index:2). */
  .pane { position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; box-sizing: border-box; border: 1px solid transparent; isolation: isolate; }
  /* Indicator border — an OVERLAY ::before ON TOP OF the content (z-index:3, like
     breathe-::after below). box-shadow on .pane itself is drawn UNDER the children
     (PaneHeader + terminal-host) and only showed through in xterm's bottom gap →
     "only the bottom was highlighted". The overlay draws a ring on top of the content on
     all sides; inset (2px inward) → not clipped by overflow ancestors
     (#app/body{overflow:hidden} from public/style.css, .cell/.split{overflow}). */
  .pane.active::before,
  .pane.alerted::before,
  .pane.exited::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 3;
  }
  .pane.active::before { box-shadow: inset 0 0 0 2px var(--accent); }
  .pane.alerted::before { box-shadow: inset 0 0 0 2px var(--alert); }
  /* exited last → when states coincide the "disconnected" color wins. */
  .pane.exited::before { box-shadow: inset 0 0 0 2px var(--exit); }
  .pane.alerted::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 3;
    animation: breathe 2.6s ease-in-out infinite;
  }
  @keyframes breathe {
    0%, 100% { box-shadow: inset 0 0 4px 0 color-mix(in srgb, var(--alert) 35%, transparent); }
    50%      { box-shadow: inset 0 0 18px 2px color-mix(in srgb, var(--alert) 80%, transparent); }
  }
  /* Background #000 so that the FitAddon remainder (a few px under the last line, xterm
     lays out a whole number of lines) does not show the parent's warm --bg, but blends
     with xterm's black console. */
  /* Horizontal padding so that xterm's text does not slide under the overlay border (::before
     inset 2px) and the alert's breathing glow (::after, up to ~18px inward). box-sizing:
     border-box is MANDATORY — there is no global `* { box-sizing }` in the project, and without it
     width:100% + padding would cause horizontal overflow/scroll. FitAddon accounts for
     padding (getComputedStyle.width for border-box = content-width), cols/rows intact. */
  .terminal-host { flex: 1; min-height: 0; width: 100%; box-sizing: border-box; padding: 0 6px; position: relative; z-index: 0; background: #000; }
  /* xterm (the new renderer) draws ITS OWN scrollbar .xterm-scrollable-element > .scrollbar
     (>.slider, VS Code-style, slider #ffffff33) — NOT the native ::-webkit-scrollbar.
     We hide ONLY the horizontal one (.scrollbar.horizontal) — it is rare, lines wrap.
     We keep the vertical one (.scrollbar.vertical) visible: it is needed for scrolling, with
     xterm's standard fade (appears on scroll/hover, fades at rest).
     Wheel/keyboard scrolling (xterm core) is unaffected in any case.
     !important — xterm sets inline visibility styles during fade. :global — the element
     is created by xterm, outside the Svelte scope. */
  :global(.xterm-scrollable-element .scrollbar.horizontal) { display: none !important; }
  /* Breathing room under the terminal's last line. A separate flex-spacer (NOT padding on
     .terminal-host) — FitAddon measures .terminal-host, its height must not include the
     gap, otherwise there is a risk of overflow/scrollbar. flex-shrink:0 holds 9px. */
  .pane-gap { height: 9px; flex-shrink: 0; background: #000; }
  .exit-overlay { position: absolute; inset: 0; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; background: #000a; color: var(--text); }
  .exit-text { font: 600 14px var(--ui-font); }
  .exit-hint { font: 12px var(--ui-font); opacity: 0.7; }
  .exit-restart { max-width: 100%; box-sizing: border-box; background: var(--accent); color: #1a1a1a; border: none; border-radius: var(--radius); padding: 8px 16px; cursor: pointer; font: 13px var(--ui-font); line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .exit-restart:hover { filter: brightness(1.1); }
</style>
