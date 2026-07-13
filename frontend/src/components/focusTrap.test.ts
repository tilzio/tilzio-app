// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { focusTrap } from './focusTrap';

afterEach(() => {
  document.body.innerHTML = '';
});

function setup(html: string) {
  const node = document.createElement('div');
  node.innerHTML = html;
  document.body.appendChild(node);
  const action = focusTrap(node);
  return { node, action };
}

function pressTab(target: Element, shift = false): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
  return ev;
}

describe('focusTrap action', () => {
  it('Tab on the last focusable wraps to the first', () => {
    const { node } = setup('<button id="a">A</button><button id="b">B</button>');
    const a = node.querySelector<HTMLElement>('#a')!;
    const b = node.querySelector<HTMLElement>('#b')!;
    b.focus();
    const ev = pressTab(b);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(a);
  });

  it('Shift+Tab on the first focusable wraps to the last', () => {
    const { node } = setup('<button id="a">A</button><input id="b">');
    const a = node.querySelector<HTMLElement>('#a')!;
    const b = node.querySelector<HTMLElement>('#b')!;
    a.focus();
    const ev = pressTab(a, true);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(b);
  });

  it('Tab in the middle is left to the browser (no preventDefault)', () => {
    const { node } = setup('<button id="a">A</button><button id="b">B</button><button id="c">C</button>');
    const b = node.querySelector<HTMLElement>('#b')!;
    b.focus();
    const ev = pressTab(b);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('pulls focus back into the trap when focus is outside the node', () => {
    const { node } = setup('<button id="a">A</button><button id="b">B</button>');
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    // keydown listens on the node — focus escaped, next Tab inside re-enters at the first
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    node.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(node.querySelector('#a'));
  });

  it('skips disabled controls and tabindex="-1"', () => {
    const { node } = setup(
      '<button id="a">A</button><button id="skip" disabled>D</button><div id="ti" tabindex="-1"></div><button id="b">B</button>',
    );
    const b = node.querySelector<HTMLElement>('#b')!;
    b.focus();
    pressTab(b);
    expect(document.activeElement).toBe(node.querySelector('#a')); // wrapped, skipping disabled
  });

  it('non-Tab keys are ignored', () => {
    const { node } = setup('<button id="a">A</button>');
    const a = node.querySelector<HTMLElement>('#a')!;
    a.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('destroy removes the listener', () => {
    const { node, action } = setup('<button id="a">A</button><button id="b">B</button>');
    const b = node.querySelector<HTMLElement>('#b')!;
    action.destroy();
    b.focus();
    const ev = pressTab(b);
    expect(ev.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(b);
  });
});
