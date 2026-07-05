import { describe, it, expect, vi, beforeEach } from 'vitest';

// The router lazily subscribes via @wailsio/runtime on first register(); mock it
// so the unit test exercises routing/liveSet without a live Wails runtime.
vi.mock('@wailsio/runtime', () => ({ Events: { On: vi.fn(() => () => {}) } }));

// exitedPanes.svelte uses $state (Svelte runes) — we mock it purely for the unit test.
// vi.hoisted is needed so the variable is available inside the vi.mock factory (hoisted to top).
const { mockMarkExited } = vi.hoisted(() => ({ mockMarkExited: vi.fn() }));
vi.mock('./exitedPanes.svelte', () => ({ markExited: mockMarkExited }));

import { ptyEvents, routeOutput, routeExited, isAlreadySpawnedError, __resetForTests } from './ptyEvents';

beforeEach(() => {
  __resetForTests();
  mockMarkExited.mockClear();
});

describe('ptyEvents', () => {
  it('routes output to the registered handler', () => {
    const out = vi.fn();
    ptyEvents.register('p1', out, vi.fn());
    routeOutput('p1', new Uint8Array([65]));
    expect(out).toHaveBeenCalledTimes(1);
    expect(out.mock.calls[0][0]).toEqual(new Uint8Array([65]));
  });

  it('ignores output for an unregistered pane (output already in the back-ring)', () => {
    expect(() => routeOutput('ghost', new Uint8Array([1]))).not.toThrow();
  });

  it('unregister stops delivery', () => {
    const out = vi.fn();
    ptyEvents.register('p1', out, vi.fn());
    ptyEvents.unregister('p1');
    routeOutput('p1', new Uint8Array([1]));
    expect(out).not.toHaveBeenCalled();
  });

  it('markLive/isLive track spawned panes; exit clears live and notifies', () => {
    const exited = vi.fn();
    ptyEvents.register('p1', vi.fn(), exited);
    ptyEvents.markLive('p1');
    expect(ptyEvents.isLive('p1')).toBe(true);
    routeExited('p1', 0);
    expect(ptyEvents.isLive('p1')).toBe(false);
    expect(exited).toHaveBeenCalledWith(0);
  });

  it('routeExited calls markExited FIRST (before the handler and liveSet.delete)', () => {
    // SSOT constraints.md §68-70: markExited must be the first line of routeExited,
    // so exitedPanes.codes updates even if TerminalPane is not mounted.
    const callOrder: string[] = [];
    mockMarkExited.mockImplementation(() => callOrder.push('markExited'));
    const exitedHandler = vi.fn(() => callOrder.push('handler'));
    ptyEvents.register('p2', vi.fn(), exitedHandler);
    ptyEvents.markLive('p2');
    routeExited('p2', 137);
    expect(mockMarkExited).toHaveBeenCalledWith('p2', 137);
    expect(callOrder[0]).toBe('markExited');  // as the first line
    expect(callOrder[1]).toBe('handler');     // handler — after
  });
});

describe('isAlreadySpawnedError', () => {
  it('detects the Go ErrAlreadySpawned message', () => {
    expect(isAlreadySpawnedError(new Error('core: session already exists for pane'))).toBe(true);
  });

  it('detects the Wails JSON-wrapped form (as seen in the runtime)', () => {
    const err = new Error('{"message":"core: session already exists for pane","cause":{},"kind":"RuntimeError"}');
    expect(isAlreadySpawnedError(err)).toBe(true);
  });

  it('detects a plain (non-Error) string carrying the message', () => {
    expect(isAlreadySpawnedError('Error: core: session already exists for pane')).toBe(true);
  });

  it('does not match an unrelated spawn failure', () => {
    expect(isAlreadySpawnedError(new Error('fork/exec /bin/zsh: no such file'))).toBe(false);
  });

  it('does not throw and returns false for null/undefined', () => {
    expect(isAlreadySpawnedError(null)).toBe(false);
    expect(isAlreadySpawnedError(undefined)).toBe(false);
  });
});

describe('ptyEvents plugin subscriptions', () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  it('routeOutput fans out to subscribers AFTER the handler; coalesces before flush', () => {
    const posts: any[] = [];
    ptyEvents.setPluginPoster((_pid, ev) => posts.push(ev));
    ptyEvents.markLive('pane1');
    const seen: string[] = [];
    ptyEvents.register('pane1', (b) => seen.push(new TextDecoder().decode(b)), () => {});
    ptyEvents.subscribePlugin('plug', 'pane1', 'o1', 'output');
    routeOutput('pane1', enc('ab'));
    routeOutput('pane1', enc('cd'));
    expect(seen.join('|')).toBe('ab|cd');          // TerminalPane untouched
    expect(posts).toHaveLength(0);                 // before flush — coalescing
    ptyEvents.__flushForTests();
    expect(posts).toHaveLength(1);
    expect(posts[0].name).toBe('terminal-output');
    expect(posts[0].data.subId).toBe('o1');
    expect(new TextDecoder().decode(posts[0].data.bytes)).toBe('abcd');  // concatenated
  });

  it('a throwing poster does NOT break the TerminalPane handler', () => {
    ptyEvents.setPluginPoster(() => { throw new Error('boom'); });
    let got = '';
    ptyEvents.markLive('p');
    ptyEvents.register('p', (b) => { got = new TextDecoder().decode(b); }, () => {});
    ptyEvents.subscribePlugin('plug', 'p', 'o1', 'output');
    routeOutput('p', enc('xy'));
    expect(got).toBe('xy');
    expect(() => ptyEvents.__flushForTests()).not.toThrow();
  });

  it('routeExited fans out exit and evicts ALL of the pane\'s subscriptions (protection against paneId reuse)', () => {
    const posts: any[] = [];
    ptyEvents.setPluginPoster((_pid, ev) => posts.push(ev));
    ptyEvents.markLive('p');
    ptyEvents.register('p', () => {}, () => {});
    ptyEvents.subscribePlugin('plug', 'p', 'o1', 'output');
    ptyEvents.subscribePlugin('plug', 'p', 'e1', 'exit');
    routeExited('p', 7);
    expect(posts.find((e) => e.name === 'terminal-exit')?.data).toEqual({ subId: 'e1', code: 7 });
    posts.length = 0;
    routeOutput('p', enc('z'));                     // the same pane "came back to life" — subscriptions already removed
    ptyEvents.__flushForTests();
    expect(posts).toHaveLength(0);
  });

  it('unsubscribePlugin removes all of the plugin\'s subscriptions', () => {
    const posts: any[] = [];
    ptyEvents.setPluginPoster((_pid, ev) => posts.push(ev));
    ptyEvents.markLive('p');
    ptyEvents.subscribePlugin('plug', 'p', 'o1', 'output');
    ptyEvents.unsubscribePlugin('plug');
    routeOutput('p', enc('z'));
    ptyEvents.__flushForTests();
    expect(posts).toHaveLength(0);
  });

  it('drop-oldest bounded-queue: on PENDING_CAP overflow the oldest chunks are dropped', () => {
    // PENDING_CAP = 256 * 1024 = 262144 bytes
    // We push 4 chunks of 100 KiB each (each chunk filled with value k+1 to tell them apart).
    // Total 400 KiB > 256 KiB → the while-loop must shift out the oldest ones.
    //
    // Simulating the while-loop:
    //   after push chunk0 (100k): total=100k               — OK
    //   after push chunk1 (100k): total=200k               — OK
    //   after push chunk2 (100k): total=300k > 256k, buf.length=3>1 → shift chunk0; total=200k — OK
    //   after push chunk3 (100k): total=300k > 256k, buf.length=3>1 → shift chunk1; total=200k — OK
    // Result: chunk2 and chunk3 remain in pendingOut (200k total).
    const CHUNK = 100 * 1024;
    const chunk0 = new Uint8Array(CHUNK).fill(1);
    const chunk1 = new Uint8Array(CHUNK).fill(2);
    const chunk2 = new Uint8Array(CHUNK).fill(3);
    const chunk3 = new Uint8Array(CHUNK).fill(4);

    const posts: any[] = [];
    ptyEvents.setPluginPoster((_pid, ev) => posts.push(ev));
    ptyEvents.markLive('pane-cap');
    ptyEvents.register('pane-cap', () => {}, () => {});
    ptyEvents.subscribePlugin('plug-cap', 'pane-cap', 'cap-sub', 'output');

    routeOutput('pane-cap', chunk0);
    routeOutput('pane-cap', chunk1);
    routeOutput('pane-cap', chunk2);
    routeOutput('pane-cap', chunk3);

    ptyEvents.__flushForTests();

    // Exactly one post with the surviving chunks merged
    expect(posts).toHaveLength(1);
    expect(posts[0].name).toBe('terminal-output');
    const merged: Uint8Array = posts[0].data.bytes;

    // Only chunk2 and chunk3 should survive (200 KiB total)
    const expectedLen = CHUNK * 2;
    expect(merged.length).toBe(expectedLen);

    // Tail of merged = chunk3 (filled with 4)
    const tail = merged.slice(merged.length - CHUNK);
    expect(tail.every((b) => b === 4)).toBe(true);

    // Head of merged = chunk2 (filled with 3)
    const head = merged.slice(0, CHUNK);
    expect(head.every((b) => b === 3)).toBe(true);

    // Markers for chunk0 (1) and chunk1 (2) are absent
    expect(merged.some((b) => b === 1)).toBe(false);
    expect(merged.some((b) => b === 2)).toBe(false);
  });
});
