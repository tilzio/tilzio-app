import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Read the CSS as a raw string via node:fs — vitest runs in the Node environment
const css = readFileSync(fileURLToPath(new URL('./theme.css', import.meta.url)), 'utf8');

describe('theme.css tokens S0.1', () => {
  it('--text-dim lightened to #a89984 (WCAG fix)', () => {
    expect(css).toMatch(/--text-dim:\s*#a89984/i);
    expect(css).not.toMatch(/--text-dim:\s*#928374/i);
  });
  it('new color tokens added', () => {
    expect(css).toMatch(/--text-faint:\s*#7c6f64/i);
    expect(css).toMatch(/--text-bright:\s*#d5c4a1/i);
    expect(css).toMatch(/--aqua:\s*#83a598/i);
    expect(css).toMatch(/--border-2:\s*#4a4036/i);
    expect(css).toMatch(/--idle:\s*#5a5450/i);
    expect(css).toMatch(/--cyan:\s*#2bd9c4/i);
  });
  it('--radius-xl added', () => {
    expect(css).toMatch(/--radius-xl:\s*9px/i);
  });
  it('base palette intact', () => {
    expect(css).toMatch(/--accent:\s*#fe8019/i);
  });
  it('--ui-font contains JetBrains Mono (M4.1)', () => {
    expect(css).toMatch(/--ui-font:[^;]*'JetBrains Mono'/i);
  });
});

describe('theme.css header S0.2', () => {
  it('--pane-header-h raised to 28px', () => {
    expect(css).toMatch(/--pane-header-h:\s*28px/i);
    expect(css).not.toMatch(/--pane-header-h:\s*26px/i);
  });
});

describe('theme.css keyframes S0.3', () => {
  it('tzPulseDot and tilzBell added', () => {
    expect(css).toMatch(/@keyframes\s+tzPulseDot/);
    expect(css).toMatch(/@keyframes\s+tilzBell/);
  });
  it('tilzBell swings both ways', () => {
    expect(css).toContain('rotate(-12deg)');
    expect(css).toContain('rotate(12deg)');
  });
  it('existing uwPulse not overwritten', () => {
    expect(css).toMatch(/@keyframes\s+uwPulse/);
  });
});
