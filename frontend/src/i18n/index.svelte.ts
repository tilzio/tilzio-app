import en from './locales/en.json';
import ja from './locales/ja.json';
import zhHans from './locales/zh-Hans.json';
import zhHant from './locales/zh-Hant.json';
import ko from './locales/ko.json';
import de from './locales/de.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
import da from './locales/da.json';
import pl from './locales/pl.json';
import ru from './locales/ru.json';
import bs from './locales/bs.json';
import ar from './locales/ar.json';
import nb from './locales/nb.json';
import ptBR from './locales/pt-BR.json';
import th from './locales/th.json';
import tr from './locales/tr.json';
import km from './locales/km.json';
import uk from './locales/uk.json';

export type Locale =
  | 'en' | 'ja' | 'zh-Hans' | 'zh-Hant' | 'ko' | 'de' | 'es' | 'fr' | 'it' | 'da'
  | 'pl' | 'ru' | 'bs' | 'ar' | 'nb' | 'pt-BR' | 'th' | 'tr' | 'km' | 'uk';
export type Dict = Record<string, unknown>;

const DICTS: Record<string, Dict> = {
  en, ja, 'zh-Hans': zhHans, 'zh-Hant': zhHant, ko, de, es, fr, it, da,
  pl, ru, bs, ar, nb, 'pt-BR': ptBR, th, tr, km, uk,
};

// Right-to-left locales — the app sets <html dir="rtl"> when one is active.
const RTL_LOCALES = new Set<string>(['ar']);
export function isRTL(l: string): boolean {
  return RTL_LOCALES.has(l);
}

// Native-name labels for the language picker (shown in each language's own script).
export const AVAILABLE_LOCALES: ReadonlyArray<{ id: Locale; label: string; rtl?: boolean }> = [
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' },
  { id: 'zh-Hans', label: '简体中文' },
  { id: 'zh-Hant', label: '繁體中文' },
  { id: 'ko', label: '한국어' },
  { id: 'de', label: 'Deutsch' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'it', label: 'Italiano' },
  { id: 'da', label: 'Dansk' },
  { id: 'pl', label: 'Polski' },
  { id: 'ru', label: 'Русский' },
  { id: 'bs', label: 'Bosanski' },
  { id: 'ar', label: 'العربية', rtl: true },
  { id: 'nb', label: 'Norsk Bokmål' },
  { id: 'pt-BR', label: 'Português (Brasil)' },
  { id: 'th', label: 'ไทย' },
  { id: 'tr', label: 'Türkçe' },
  { id: 'km', label: 'ខ្មែរ' },
  { id: 'uk', label: 'Українська' },
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

// Apply the document text direction for the given locale (no-op outside a browser).
function applyDir(l: string): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dir = isRTL(l) ? 'rtl' : 'ltr';
  }
}

export function setLocale(l: Locale): void {
  locale = l;
  dict = DICTS[l] ?? en;
  applyDir(l);
}

export function currentLocale(): Locale {
  return locale;
}

export function initLocale(persisted?: string): void {
  if (persisted && persisted in DICTS) setLocale(persisted as Locale);
  else setLocale('en');
}
