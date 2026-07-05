import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Regression guard for the CSS of the active/hovered Settings category (S7.2): the mockup draws
// an orange inset bar on the left + tint + weight. Repo idiom — read the .svelte source
// as text (like theme.tokens.test.ts), in a node environment (NOT jsdom — otherwise
// import.meta.url = http://, and fileURLToPath fails).
const src = readFileSync(fileURLToPath(new URL('./SettingsDialog.svelte', import.meta.url)), 'utf8');

describe('SettingsDialog — active category item (S7.2 left-bar)', () => {
  it('.cat.active carries an orange inset bar + tint + font-weight (per the S7.2 mockup)', () => {
    const m = src.match(/\.cat\.active\s*\{[^}]*\}/);
    expect(m).toBeTruthy();
    const rule = m![0];
    expect(rule).toMatch(/box-shadow:\s*inset\s+2px\s+0\s+0\s+var\(--accent\)/);
    expect(rule).toMatch(/background:\s*rgba\(254,\s*128,\s*25,\s*\.1\)/);
    expect(rule).toMatch(/font-weight:\s*500/);
  });
  it('.cat:hover:not(.active) uses a soft tint rgba(235,219,178,.06)', () => {
    const m = src.match(/\.cat:hover:not\(\.active\)\s*\{[^}]*\}/);
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/rgba\(235,\s*219,\s*178,\s*\.06\)/);
  });
});
