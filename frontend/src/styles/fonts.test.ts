import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Guard for the JetBrains Mono UI font. The redesign audit found that Medium.woff2 was a
// byte-for-byte copy of Regular (faux-bold at 500/600/700). We read public/* in the node environment.
const pub = (f: string) => fileURLToPath(new URL(`../../public/${f}`, import.meta.url));
const css = readFileSync(pub('style.css'), 'utf8');

describe('JetBrains Mono UI font — real weights (anti-faux-bold)', () => {
  it('@font-face weights 600 and 700 added with references to SemiBold/Bold woff2', () => {
    expect(css).toMatch(/font-weight:\s*600/);
    expect(css).toMatch(/font-weight:\s*700/);
    expect(css).toMatch(/JetBrainsMono-SemiBold\.woff2/);
    expect(css).toMatch(/JetBrainsMono-Bold\.woff2/);
  });

  it('Medium/SemiBold/Bold — DIFFERENT files, not copies of Regular', () => {
    const reg = readFileSync(pub('JetBrainsMono-Regular.woff2'));
    const med = readFileSync(pub('JetBrainsMono-Medium.woff2'));
    const semi = readFileSync(pub('JetBrainsMono-SemiBold.woff2'));
    const bold = readFileSync(pub('JetBrainsMono-Bold.woff2'));
    expect(med.equals(reg)).toBe(false);
    expect(semi.equals(reg)).toBe(false);
    expect(bold.equals(reg)).toBe(false);
    expect(med.equals(semi)).toBe(false);
    expect(semi.equals(bold)).toBe(false);
  });

  it('all four files have a valid wOF2 signature', () => {
    for (const f of ['JetBrainsMono-Regular', 'JetBrainsMono-Medium', 'JetBrainsMono-SemiBold', 'JetBrainsMono-Bold']) {
      const buf = readFileSync(pub(`${f}.woff2`));
      expect(buf.subarray(0, 4).toString('latin1')).toBe('wOF2');
    }
  });
});
