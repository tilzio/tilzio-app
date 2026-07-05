import type { Dir } from './paneGeometry';

// A resolved hotkey (design §12.4). App maps each to an action/selector call.
export type HotkeyAction =
  | { type: 'newTab' }
  | { type: 'closePane' }
  | { type: 'split'; dir: 'h' | 'v' }
  | { type: 'selectTabIndex'; index: number }
  | { type: 'focusNeighbor'; dir: Dir }
  | { type: 'zoom' }
  | { type: 'newSpace' }
  | { type: 'switchSpace'; delta: number }
  | { type: 'toggleCollapsed' }
  | { type: 'toggleSidebar' }
  | { type: 'toggleBottomPanel' }
  | { type: 'toggleRightArea' }
  | { type: 'restartPane' }
  | { type: 'openFile' }
  | { type: 'save' };

// Map a keydown to its §8 action, or null when it is not one of ours. Every bind
// requires ⌘ (metaKey); we read e.code so ⌥ does not remap letters to symbols.
export function resolveHotkey(e: KeyboardEvent): HotkeyAction | null {
  if (!e.metaKey) return null;
  const { shiftKey: shift, altKey: alt, ctrlKey: ctrl } = e;
  const plain = !shift && !alt && !ctrl; // ⌘ only

  // ⌘⌥-arrows: neighbor pane. ⌘⌥.: collapse toggle. (alt, not ctrl/shift.)
  if (alt && !ctrl && !shift) {
    if (e.code === 'ArrowLeft') return { type: 'focusNeighbor', dir: 'left' };
    if (e.code === 'ArrowRight') return { type: 'focusNeighbor', dir: 'right' };
    if (e.code === 'ArrowUp') return { type: 'focusNeighbor', dir: 'up' };
    if (e.code === 'ArrowDown') return { type: 'focusNeighbor', dir: 'down' };
    if (e.code === 'Period') return { type: 'toggleCollapsed' };
    if (e.code === 'KeyB') return { type: 'toggleRightArea' };
  }
  // ⌘⌃←/→: switch space. (ctrl, not alt/shift.)
  if (ctrl && !alt && !shift) {
    if (e.code === 'ArrowLeft') return { type: 'switchSpace', delta: -1 };
    if (e.code === 'ArrowRight') return { type: 'switchSpace', delta: 1 };
  }
  // ⌘⇧D: stacked split. Check shift before the plain ⌘D below.
  if (shift && !alt && !ctrl && e.code === 'KeyD') return { type: 'split', dir: 'h' };

  if (plain) {
    if (e.code === 'KeyB') return { type: 'toggleSidebar' };
    if (e.code === 'KeyJ') return { type: 'toggleBottomPanel' };
    if (e.code === 'KeyO') return { type: 'openFile' };
    if (e.code === 'KeyS') return { type: 'save' };
    if (e.code === 'KeyT') return { type: 'newTab' };
    if (e.code === 'KeyW') return { type: 'closePane' };
    if (e.code === 'KeyD') return { type: 'split', dir: 'v' };
    if (e.code === 'KeyN') return { type: 'newSpace' };
    if (e.code === 'KeyR') return { type: 'restartPane' };
    if (e.code === 'Enter') return { type: 'zoom' };
    if (/^Digit[1-9]$/.test(e.code)) {
      return { type: 'selectTabIndex', index: Number(e.code.slice(5)) - 1 };
    }
  }
  return null;
}
