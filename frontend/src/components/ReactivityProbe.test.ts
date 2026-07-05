// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';

// Mock the xterm/bridge layers so the harness renders without a real terminal.
vi.mock('../bridge/core', () => ({
  coreBridge: {
    loadLayout: vi.fn().mockResolvedValue(null),
    saveLayout: vi.fn().mockResolvedValue(undefined),
    loadScrollback: vi.fn().mockResolvedValue(new Uint8Array()),
    spawn: vi.fn().mockResolvedValue(undefined),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  },
}));
vi.mock('../bridge/ptyEvents', () => ({
  ptyEvents: {
    register: vi.fn(),
    unregister: vi.fn(),
    isLive: () => false,
    markLive: vi.fn(),
  },
}));
// Pulls in __mocks__/TerminalPane.svelte (a DOM-only stub rendering [data-pane-id]).
vi.mock('./TerminalPane.svelte');

import Probe from './ReactivityProbe.svelte';
import { store, actions } from '../state/store.svelte';
import { initialState } from '../state/types';
import type { Leaf } from '../state/types';

beforeEach(() => {
  store.app = initialState();
});

describe('App-style split reactivity', () => {
  it('renders a second pane after splitPane on the active leaf (node prop updates under a stable tabKey)', async () => {
    const { container } = render(Probe);
    await tick();
    expect(container.querySelectorAll('[data-pane-id]')).toHaveLength(1);

    const leafId = (store.app.spaces[0].tabs[0].root as Leaf).id;
    actions.splitPane(leafId, 'v');
    await tick();

    expect(container.querySelectorAll('[data-pane-id]')).toHaveLength(2);
  });
});
