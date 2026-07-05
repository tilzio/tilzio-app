import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import en from './locales/en.json';

function flatten(obj: any, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
}
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : walk(p);
    return /\.(svelte|ts)$/.test(n) && !n.endsWith('.test.ts') ? [p] : [];
  });
}
const SRC = join(__dirname, '..');
const used = new Set<string>();
for (const f of walk(SRC)) {
  const src = readFileSync(f, 'utf8');
  // keys may contain letters, digits, '_', '.', and ':' (e.g. perm.state:read.title)
  for (const m of src.matchAll(/\bt\(\s*['"]([\w.:]+)['"]/g)) used.add(m[1]);
}
const defined = new Set(flatten(en));

describe('i18n key integrity', () => {
  it('every used key exists in en.json', () => {
    const missing = [...used].filter((k) => !defined.has(k));
    expect(missing).toEqual([]);
  });
  it('no dead keys in en.json (every defined key is used)', () => {
    const dead = [...defined].filter((k) => !used.has(k));
    expect(dead).toEqual([]);
  });
});
