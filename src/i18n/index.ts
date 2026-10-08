import tr from './tr.json';
import en from './en.json';
import ar from './ar.json';

export type Lang = 'tr' | 'en' | 'ar';
export type MessageKey = keyof typeof tr;

const tables: Record<Lang, Record<MessageKey, string>> = { tr, en, ar };
export const LANGS: readonly Lang[] = ['tr', 'en', 'ar'];

let current: Lang = 'tr';

export function setLang(lang: Lang): void {
  current = lang;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }
}

export function getLang(): Lang {
  return current;
}

/** Translate; falls back to Turkish, then to the key itself. `{name}` placeholders are replaced. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let s = tables[current][key] ?? tables.tr[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Keys missing in a language compared to Turkish (used by unit tests). */
export function missingKeys(lang: Lang): string[] {
  return Object.keys(tables.tr).filter((k) => !(k in tables[lang]));
}
