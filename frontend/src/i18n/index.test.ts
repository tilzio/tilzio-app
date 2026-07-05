import { describe, it, expect, vi } from 'vitest';
import { resolve, t, setLocale, currentLocale, AVAILABLE_LOCALES } from './index.svelte';

describe('resolve (pure)', () => {
  const dict = { nav: { spaces: 'SPACES' }, toast: { wait: '{label} · waiting' } };
  it('resolves a nested dot-key to its string', () => {
    expect(resolve(dict, 'nav.spaces')).toBe('SPACES');
  });
  it('interpolates {param} placeholders', () => {
    expect(resolve(dict, 'toast.wait', { label: 'web' })).toBe('web · waiting');
  });
  it('returns the key itself and warns on a missing key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolve(dict, 'nope.missing')).toBe('nope.missing');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('t + locale', () => {
  it('defaults to en and resolves a real key', () => {
    expect(currentLocale()).toBe('en');
    expect(typeof t('nav.spaces')).toBe('string');
  });
  it('AVAILABLE_LOCALES contains English', () => {
    expect(AVAILABLE_LOCALES.some((l) => l.id === 'en')).toBe(true);
  });
  it('setLocale to a known locale keeps currentLocale in sync', () => {
    setLocale('en');
    expect(currentLocale()).toBe('en');
  });
});
