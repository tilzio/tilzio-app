import { describe, it, expect } from 'vitest';
import { resolveHotkey } from './keymap';

// Minimal KeyboardEvent stand-in: resolveHotkey only reads these fields. meta
// defaults true (every §8 bind requires ⌘); other modifiers default false.
function key(
  code: string,
  mods: Partial<{ meta: boolean; shift: boolean; alt: boolean; ctrl: boolean }> = {},
): KeyboardEvent {
  return {
    code,
    metaKey: mods.meta ?? true,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
    ctrlKey: mods.ctrl ?? false,
  } as KeyboardEvent;
}

describe('resolveHotkey', () => {
  it('maps the core ⌘ chords', () => {
    expect(resolveHotkey(key('KeyT'))).toEqual({ type: 'newTab' });
    expect(resolveHotkey(key('KeyW'))).toEqual({ type: 'closePane' });
    expect(resolveHotkey(key('KeyN'))).toEqual({ type: 'newSpace' });
    expect(resolveHotkey(key('KeyR'))).toEqual({ type: 'restartPane' });
    expect(resolveHotkey(key('Enter'))).toEqual({ type: 'zoom' });
  });

  it('maps ⌘S to save', () => {
    expect(resolveHotkey(key('KeyS'))).toEqual({ type: 'save' });
  });

  it('distinguishes ⌘D (side-by-side) from ⌘⇧D (stacked)', () => {
    expect(resolveHotkey(key('KeyD'))).toEqual({ type: 'split', dir: 'v' });
    expect(resolveHotkey(key('KeyD', { shift: true }))).toEqual({ type: 'split', dir: 'h' });
  });

  it('maps ⌘1–9 to a zero-based tab index', () => {
    expect(resolveHotkey(key('Digit1'))).toEqual({ type: 'selectTabIndex', index: 0 });
    expect(resolveHotkey(key('Digit9'))).toEqual({ type: 'selectTabIndex', index: 8 });
  });

  it('distinguishes ⌘⌥-arrows (neighbor) from ⌘⌃-arrows (space)', () => {
    expect(resolveHotkey(key('ArrowLeft', { alt: true }))).toEqual({ type: 'focusNeighbor', dir: 'left' });
    expect(resolveHotkey(key('ArrowDown', { alt: true }))).toEqual({ type: 'focusNeighbor', dir: 'down' });
    expect(resolveHotkey(key('ArrowLeft', { ctrl: true }))).toEqual({ type: 'switchSpace', delta: -1 });
    expect(resolveHotkey(key('ArrowRight', { ctrl: true }))).toEqual({ type: 'switchSpace', delta: 1 });
  });

  it('maps ⌘⌥. to toggle collapse', () => {
    expect(resolveHotkey(key('Period', { alt: true }))).toEqual({ type: 'toggleCollapsed' });
  });

  it('ignores keys without ⌘ and unknown chords', () => {
    expect(resolveHotkey(key('KeyT', { meta: false }))).toBeNull();
    expect(resolveHotkey(key('KeyQ'))).toBeNull();
  });
});

describe('⌘B — toggle sidebar', () => {
  it('⌘B → toggleSidebar', () => {
    expect(resolveHotkey(key('KeyB'))).toEqual({ type: 'toggleSidebar' });
  });
  it('⌘⇧B / ⌘⌃B do not trigger', () => {
    expect(resolveHotkey(key('KeyB', { shift: true }))).toBeNull();
    expect(resolveHotkey(key('KeyB', { ctrl: true }))).toBeNull();
  });
  it('B without ⌘ → null', () => {
    expect(resolveHotkey(key('KeyB', { meta: false }))).toBeNull();
  });
});

it('⌘⌥B → toggleRightArea (while ⌘B stays toggleSidebar)', () => {
  expect(resolveHotkey(key('KeyB'))).toEqual({ type: 'toggleSidebar' });
  expect(resolveHotkey(key('KeyB', { alt: true }))).toEqual({ type: 'toggleRightArea' });
});

describe('⌘J — toggle bottom panel', () => {
  it('⌘J → toggleBottomPanel; ⌘⇧/⌥/⌃J → null', () => {
    expect(resolveHotkey(key('KeyJ'))).toEqual({ type: 'toggleBottomPanel' });
    expect(resolveHotkey(key('KeyJ', { shift: true }))).toBeNull();
    expect(resolveHotkey(key('KeyJ', { alt: true }))).toBeNull();
    expect(resolveHotkey(key('KeyJ', { ctrl: true }))).toBeNull();
  });
});

it('⌘O → openFile', () => {
  expect(resolveHotkey(key('KeyO', { meta: true }))).toEqual({ type: 'openFile' });
});
