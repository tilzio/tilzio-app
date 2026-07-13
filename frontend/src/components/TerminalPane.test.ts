// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

// Capture the exit handler TerminalPane registers, so tests can simulate a pty exit.
const hooks = vi.hoisted(() => ({ onExited: null as ((code: number) => void) | null }));

// Capture xterm link-provider and OSC 7 handler registered by TerminalPane.
let capturedProvider: any = null;
let capturedOsc7: ((data: string) => boolean) | null = null;
let capturedTermOpts: any = null;
let capturedTerm: any = null;

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    options: any = {};
    constructor(opts: any) { capturedTermOpts = opts; this.options = { ...opts }; capturedTerm = this; }
    loadAddon() {}
    open() {}
    write = vi.fn();
    hasSelection = vi.fn(() => false);
    getSelection = vi.fn(() => '');
    onData() {}
    onBell() {}
    dispose() {}
    get cols() { return 80; }
    get rows() { return 24; }
    parser = {
      registerOscHandler(code: number, cb: (data: string) => boolean) {
        if (code === 7) capturedOsc7 = cb;
        return { dispose() {} };
      },
    };
    registerLinkProvider(p: any) {
      capturedProvider = p;
      return { dispose() {} };
    }
    buffer = {
      active: {
        getLine(_n: number) {
          return { translateToString: () => '' };
        },
      },
    };
  },
}));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }));
// Capture the WebglAddon instance so tests can drive its context-loss callback.
const webglHooks = vi.hoisted(() => ({
  instance: null as null | { onContextLoss: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; lossCb: (() => void) | null },
}));
vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class {
    lossCb: (() => void) | null = null;
    onContextLoss = vi.fn((cb: () => void) => { this.lossCb = cb; return { dispose() {} }; });
    dispose = vi.fn();
    constructor() { webglHooks.instance = this as any; }
  },
}));
vi.mock('../bridge/linkResolve', () => ({
  linkCwd: { set: vi.fn(), get: vi.fn(() => '/proj'), delete: vi.fn() },
  linkHome: { setFrom: vi.fn(), get: vi.fn(() => '/Users/me') },
  checkPathExists: vi.fn(async () => true),
}));
vi.mock('../bridge/pathLinks', () => ({
  matchPaths: vi.fn(() => []),
  resolvePath: vi.fn(() => null),
  parseOsc7: vi.fn((data: string) => {
    if (data.startsWith('file://')) {
      try { return new URL(data).pathname; } catch { return null; }
    }
    return data.startsWith('/') ? data : null;
  }),
}));
vi.mock('../bridge/core', () => ({
  coreBridge: {
    loadScrollback: vi.fn().mockResolvedValue(new Uint8Array()),
    spawn: vi.fn().mockResolvedValue(undefined),
    write: vi.fn(),
    resize: vi.fn().mockResolvedValue(undefined),
    kill: vi.fn().mockResolvedValue(undefined),
    shellTag: vi.fn().mockResolvedValue('zsh'),
  },
}));
vi.mock('../bridge/ptyEvents', () => ({
  ptyEvents: {
    register: vi.fn((_id: string, _out: unknown, onExited: (code: number) => void) => {
      hooks.onExited = onExited;
    }),
    unregister: vi.fn(),
    isLive: vi.fn(() => true),
    markLive: vi.fn(),
  },
  // The real detector is unit-tested in ptyEvents.test.ts; a faithful stand-in
  // here lets us drive the reattach vs real-failure branches deterministically.
  isAlreadySpawnedError: (err: unknown) =>
    String(err instanceof Error ? err.message : err).includes('session already exists for pane'),
}));
vi.mock('../bridge/paneRestart', () => ({
  paneRestart: { register: vi.fn(), unregister: vi.fn(), restart: vi.fn() },
}));

import TerminalPane from './TerminalPane.svelte';
import { coreBridge } from '../bridge/core';
import { ptyEvents } from '../bridge/ptyEvents';
import { linkCwd } from '../bridge/linkResolve';
// Real module (deliberately not mocked): the tombstone set the reaper marks on pane close.
import { reapedPanes, __resetForTests as resetReaped } from '../bridge/reapedPanes';

beforeEach(() => {
  hooks.onExited = null;
  capturedProvider = null;
  capturedOsc7 = null;
  capturedTermOpts = null;
  capturedTerm = null;
  webglHooks.instance = null;
  vi.clearAllMocks();
  // Default: pane already live → onMount skips spawn (matches pre-existing tests).
  // Reattach tests override this per-case; reset here so overrides don't leak.
  vi.mocked(ptyEvents.isLive).mockReturnValue(true);
  // jsdom lacks ResizeObserver, which TerminalPane.onMount instantiates.
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
});

describe('TerminalPane pane-tools click wiring', () => {
  it('split-right (⬌) button invokes onSplit("v")', async () => {
    const onSplit = vi.fn();
    const { getByLabelText } = render(TerminalPane, { props: { paneId: 'p1', onSplit } });
    await fireEvent.click(getByLabelText('split right'));
    expect(onSplit).toHaveBeenCalledWith('v');
  });

  it('split-down (⬍) button invokes onSplit("h")', async () => {
    const onSplit = vi.fn();
    const { getByLabelText } = render(TerminalPane, { props: { paneId: 'p1', onSplit } });
    await fireEvent.click(getByLabelText('split down'));
    expect(onSplit).toHaveBeenCalledWith('h');
  });

  it('close (×) button invokes onClose', async () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(TerminalPane, { props: { paneId: 'p1', onClose } });
    await fireEvent.click(getByLabelText('close pane'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('TerminalPane exit-overlay', () => {
  it('shows the restart overlay with a focused button when the shell exits', async () => {
    const { findByText, getByRole } = render(TerminalPane, { props: { paneId: 'p1' } });
    await waitFor(() => expect(hooks.onExited).toBeTruthy());
    hooks.onExited!(3);
    await findByText('exited (code 3)');
    const btn = getByRole('button', { name: 'Restart' });
    await waitFor(() => expect(document.activeElement).toBe(btn));
  });

  it('restart button respawns the shell and hides the overlay', async () => {
    const { findByText, getByRole, queryByText } = render(TerminalPane, { props: { paneId: 'p1' } });
    await waitFor(() => expect(hooks.onExited).toBeTruthy());
    hooks.onExited!(1);
    await findByText('exited (code 1)');
    (coreBridge.spawn as ReturnType<typeof vi.fn>).mockClear();
    await fireEvent.click(getByRole('button', { name: 'Restart' }));
    expect(coreBridge.spawn).toHaveBeenCalledWith('p1', '', 80, 24);
    await waitFor(() => expect(queryByText('exited (code 1)')).toBeNull());
  });
});

describe('TerminalPane zoom refit', () => {
  it('re-fits the terminal (calls resize) when the zoomed prop flips on', async () => {
    const { rerender } = render(TerminalPane, { props: { paneId: 'p1', zoomed: false } });
    // Wait until onMount has progressed (register captured) so term/fit exist.
    await waitFor(() => expect(hooks.onExited).toBeTruthy());
    (coreBridge.resize as ReturnType<typeof vi.fn>).mockClear();
    await rerender({ paneId: 'p1', zoomed: true });
    // Flush the requestAnimationFrame the effect schedules.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(coreBridge.resize).toHaveBeenCalled();
  });
});

describe('TerminalPane clickable paths', () => {
  it('registers a link provider and an OSC 7 handler on mount', async () => {
    render(TerminalPane, { props: { paneId: 'p1' } });
    await waitFor(() => expect(capturedProvider).not.toBeNull());
    expect(capturedOsc7).not.toBeNull();
  });

  it('OSC 7 handler updates the pane live-cwd', async () => {
    render(TerminalPane, { props: { paneId: 'p1' } });
    await waitFor(() => expect(capturedOsc7).not.toBeNull());
    capturedOsc7!('file://host/proj/sub');
    expect(linkCwd.set).toHaveBeenCalledWith('p1', '/proj/sub');
  });
});

describe('TerminalPane fontSize prop', () => {
  it('passes the fontSize prop to the Terminal constructor', async () => {
    render(TerminalPane, { props: { paneId: 'p1', fontSize: 17 } });
    await waitFor(() => expect(capturedTermOpts).not.toBeNull());
    expect(capturedTermOpts.fontSize).toBe(17);
  });

  it('applies a changed fontSize prop reactively to the live terminal', async () => {
    const { rerender } = render(TerminalPane, { props: { paneId: 'p1', fontSize: 13 } });
    await waitFor(() => expect(capturedTerm).not.toBeNull());
    await rerender({ paneId: 'p1', fontSize: 18 });
    await waitFor(() => expect(capturedTerm.options.fontSize).toBe(18));
  });
});

describe('TerminalPane WebGL context loss (FIX: blank pane after GPU context loss)', () => {
  it('registers a context-loss handler that disposes the addon (xterm falls back to DOM renderer)', async () => {
    render(TerminalPane, { props: { paneId: 'p1' } });
    await waitFor(() => expect(webglHooks.instance).not.toBeNull());
    expect(webglHooks.instance!.onContextLoss).toHaveBeenCalled();
    expect(webglHooks.instance!.lossCb).toBeTruthy();
    webglHooks.instance!.lossCb!();
    expect(webglHooks.instance!.dispose).toHaveBeenCalled();
  });
});

describe('TerminalPane reattach after reload (ErrAlreadySpawned)', () => {
  it('treats ErrAlreadySpawned as live and wires input/links instead of erroring', async () => {
    // Simulate a webview reload: JS liveSet is empty but Go still has the session,
    // so onMount attempts spawn and Go answers ErrAlreadySpawned.
    vi.mocked(ptyEvents.isLive).mockReturnValue(false);
    (coreBridge.spawn as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('{"message":"core: session already exists for pane","cause":{},"kind":"RuntimeError"}'),
    );
    render(TerminalPane, { props: { paneId: 'p1' } });
    // Reattach: marks the pane live and FALLS THROUGH to register the link provider.
    // The pre-fix early-return left the provider (and input/resize) unregistered.
    await waitFor(() => expect(ptyEvents.markLive).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(capturedProvider).not.toBeNull());
  });

  it('a genuine spawn failure still errors and does not reattach', async () => {
    vi.mocked(ptyEvents.isLive).mockReturnValue(false);
    (coreBridge.spawn as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('fork/exec /bin/zsh: no such file'),
    );
    render(TerminalPane, { props: { paneId: 'p1' } });
    await waitFor(() =>
      expect(capturedTerm.write).toHaveBeenCalledWith(expect.stringContaining('failed to start shell')),
    );
    expect(ptyEvents.markLive).not.toHaveBeenCalled();
    expect(capturedProvider).toBeNull();
  });
});

describe('TerminalPane scrollback replay resets sticky mouse modes', () => {
  it('resets mouse tracking after replaying non-empty scrollback', async () => {
    // Persisted scrollback from a session where a TUI left mouse mode on ("\e[?1003h").
    (coreBridge.loadScrollback as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Uint8Array([0x1b, 0x5b, 0x3f, 0x31, 0x30, 0x30, 0x33, 0x68]),
    );
    render(TerminalPane, { props: { paneId: 'p1' } });
    await waitFor(() =>
      expect(capturedTerm.write).toHaveBeenCalledWith(expect.stringContaining('\x1b[?1003l')),
    );
  });

  it('does not write the reset when the pane has no scrollback', async () => {
    // Default loadScrollback resolves an empty Uint8Array → nothing replayed.
    render(TerminalPane, { props: { paneId: 'p1' } });
    await waitFor(() => expect(hooks.onExited).toBeTruthy());
    const wroteReset = capturedTerm.write.mock.calls
      .flat()
      .some((a: unknown) => typeof a === 'string' && a.includes('\x1b[?1003l'));
    expect(wroteReset).toBe(false);
  });
});

describe('TerminalPane close/unmount races (spawn in flight)', () => {
  beforeEach(() => resetReaped());

  it('kills the freshly spawned session when the pane was closed mid-spawn', async () => {
    vi.mocked(ptyEvents.isLive).mockReturnValue(false);
    let resolveSpawn!: () => void;
    (coreBridge.spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise<void>((r) => { resolveSpawn = r; }),
    );
    const { unmount } = render(TerminalPane, { props: { paneId: 'p1' } });
    await waitFor(() => expect(coreBridge.spawn).toHaveBeenCalled());
    // The reaper ran (pane left the layout) while spawn was still in flight —
    // its kill hit Go before the session existed. The pane must re-kill.
    reapedPanes.mark('p1');
    unmount();
    resolveSpawn();
    await waitFor(() => expect(coreBridge.kill).toHaveBeenCalledWith('p1'));
  });

  it('a plain unmount (tab switch) mid-spawn keeps the session alive for reattach', async () => {
    vi.mocked(ptyEvents.isLive).mockReturnValue(false);
    let resolveSpawn!: () => void;
    (coreBridge.spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise<void>((r) => { resolveSpawn = r; }),
    );
    const { unmount } = render(TerminalPane, { props: { paneId: 'p1' } });
    await waitFor(() => expect(coreBridge.spawn).toHaveBeenCalled());
    unmount(); // NOT reaped — the pane still exists in the layout
    resolveSpawn();
    await new Promise((r) => setTimeout(r, 0));
    expect(coreBridge.kill).not.toHaveBeenCalled();
    // The session is live in Go — the global registry must reflect that for remount.
    expect(ptyEvents.markLive).toHaveBeenCalledWith('p1');
  });

  it('does not register pty handlers when destroyed during the scrollback load', async () => {
    let resolveSb!: (b: Uint8Array) => void;
    (coreBridge.loadScrollback as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise<Uint8Array>((r) => { resolveSb = r; }),
    );
    const { unmount } = render(TerminalPane, { props: { paneId: 'p1' } });
    unmount();
    resolveSb(new Uint8Array());
    await new Promise((r) => setTimeout(r, 0));
    // Registering after destroy would clobber a newer instance of the same pane.
    expect(ptyEvents.register).not.toHaveBeenCalled();
  });
});

describe('TerminalPane copy encoding', () => {
  function dispatchCopy() {
    const setData = vi.fn();
    const ev = new Event('copy', { bubbles: true });
    Object.defineProperty(ev, 'clipboardData', { value: { setData } });
    const preventDefault = vi.spyOn(ev, 'preventDefault');
    document.dispatchEvent(ev);
    return { setData, preventDefault };
  }

  it('puts the xterm selection on the clipboard as Unicode and cancels the native copy', async () => {
    render(TerminalPane, { props: { paneId: 'p1' } });
    await waitFor(() => expect(capturedTerm).not.toBeNull());
    capturedTerm.hasSelection.mockReturnValue(true);
    capturedTerm.getSelection.mockReturnValue('привет мир');

    const { setData, preventDefault } = dispatchCopy();
    expect(setData).toHaveBeenCalledWith('text/plain', 'привет мир');
    expect(preventDefault).toHaveBeenCalled();
  });

  it('ignores copy when the pane has no selection (other copies untouched)', async () => {
    render(TerminalPane, { props: { paneId: 'p1' } });
    await waitFor(() => expect(capturedTerm).not.toBeNull());
    capturedTerm.hasSelection.mockReturnValue(false);

    const { setData, preventDefault } = dispatchCopy();
    expect(setData).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  // The bug (UTF-8 bytes re-encoded as Mac OS Roman) mangles every non-ASCII
  // script, not just Cyrillic. The fix is language-agnostic — it writes the raw
  // Unicode selection verbatim — so any mix of scripts must survive unchanged.
  it('passes selections of any script through verbatim (multi-language)', async () => {
    render(TerminalPane, { props: { paneId: 'p1' } });
    await waitFor(() => expect(capturedTerm).not.toBeNull());
    capturedTerm.hasSelection.mockReturnValue(true);
    const mixed = 'héllo Grüße Καλημέρα 你好 こんにちは 안녕 مرحبا שלום สวัสดี 🚀🔥';
    capturedTerm.getSelection.mockReturnValue(mixed);

    const { setData, preventDefault } = dispatchCopy();
    expect(setData).toHaveBeenCalledWith('text/plain', mixed);
    expect(preventDefault).toHaveBeenCalled();
  });
});
