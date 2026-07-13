// Shared focus trap for modal dialogs (use:focusTrap on the dialog root).
// Without it Tab walks out of the modal into background buttons and a stray
// Enter can activate one of them. Wraps Tab/Shift+Tab at the edges of the
// focusables INSIDE the node; no restore-focus-on-close complexity (the dialogs
// autofocus their safe button themselves).
//
// Focusables are queried per keydown, not captured once on mount: dialog content
// is dynamic (InstallDialog swaps idle/busy/conflict bodies, screens filter lists).

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusTrap(node: HTMLElement): { destroy(): void } {
  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const els = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (els.length === 0) {
      e.preventDefault(); // nothing to move to — don't let Tab escape the modal
      return;
    }
    const first = els[0];
    const last = els[els.length - 1];
    const active = document.activeElement;
    const inside = active instanceof Node && node.contains(active);
    if (e.shiftKey) {
      if (!inside || active === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (!inside || active === last) {
      e.preventDefault();
      first.focus();
    }
  }
  // Capture phase: runs even if an inner widget stops propagation on bubble.
  node.addEventListener('keydown', onKeydown, true);
  return {
    destroy() {
      node.removeEventListener('keydown', onKeydown, true);
    },
  };
}
