import en from './locales/en.json';

export type Locale = 'en';
export type Dict = Record<string, unknown>;

const DICTS: Record<string, Dict> = { en };
export const AVAILABLE_LOCALES: ReadonlyArray<{ id: Locale; label: string }> = [
  { id: 'en', label: 'English' },
];

let locale = $state<Locale>('en');
let dict = $state<Dict>(en);

// Resolve a dot-notation key against a dictionary, interpolating {param} placeholders.
// Pure and exported for isolated testing; t() is the store-bound wrapper.
export function resolve(d: Dict, key: string, params?: Record<string, string | number>): string {
  let cur: unknown = d;
  for (const p of key.split('.')) {
    if (cur && typeof cur === 'object' && p in (cur as object)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      console.warn(`[i18n] missing key: ${key}`);
      return key;
    }
  }
  if (typeof cur !== 'string') {
    console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  let s = cur;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

export function t(key: string, params?: Record<string, string | number>): string {
  return resolve(dict, key, params);
}

export function setLocale(l: Locale): void {
  locale = l;
  dict = DICTS[l] ?? en;
}

export function currentLocale(): Locale {
  return locale;
}

export function initLocale(persisted?: string): void {
  if (persisted && persisted in DICTS) setLocale(persisted as Locale);
  else setLocale('en');
}
