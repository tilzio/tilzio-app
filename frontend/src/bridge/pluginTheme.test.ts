// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { TS_THEME_TOKENS, postTheme } from './pluginTheme';

describe('pluginTheme', () => {
  it('exposes the --ts-* token set with the app accent', () => {
    expect(TS_THEME_TOKENS['--ts-accent']).toBe('#fe8019');
    expect(TS_THEME_TOKENS['--ts-bg']).toBe('#282828');
    for (const k of Object.keys(TS_THEME_TOKENS)) expect(k.startsWith('--ts-')).toBe(true);
  });
  it('postTheme posts the ts:theme envelope to the window', () => {
    const post = vi.fn();
    postTheme({ postMessage: post } as unknown as Window);
    expect(post).toHaveBeenCalledWith({ __tsview: 1, data: { type: 'ts:theme', tokens: TS_THEME_TOKENS } }, '*');
  });
});
