import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import en from './locales/en.json';
import { AVAILABLE_LOCALES } from './index.svelte';

function flatten(obj: any, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
}

const enKeys = new Set(flatten(en));
const dir = join(__dirname, 'locales');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

describe('locale completeness', () => {
  for (const f of files) {
    it(`${f} has exactly the en key set (no missing / extra)`, () => {
      const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      const keys = new Set(flatten(d));
      const missing = [...enKeys].filter((k) => !keys.has(k));
      const extra = [...keys].filter((k) => !enKeys.has(k));
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });
  }

  it('AVAILABLE_LOCALES ids ↔ locale files are 1:1', () => {
    const fileIds = new Set(files.map((f) => f.replace(/\.json$/, '')));
    const availIds = new Set<string>(AVAILABLE_LOCALES.map((l) => l.id));
    expect([...availIds].filter((id) => !fileIds.has(id))).toEqual([]); // every listed locale has a file
    expect([...fileIds].filter((id) => !availIds.has(id))).toEqual([]); // every file is listed
  });
});
