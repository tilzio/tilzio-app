// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import TextWidget from './TextWidget.svelte';

afterEach(cleanup);

describe('TextWidget', () => {
  it('label + value: the "key/value" row is aligned (kv class)', () => {
    const { container, getByText } = render(TextWidget, {
      props: { w: { type: 'text', label: 'Today', text: '$40.44' } },
    });
    const row = container.querySelector('.text') as HTMLElement;
    // kv enables flex space-between → the value moves to the right column, aligned across all rows
    expect(row.classList.contains('kv')).toBe(true);
    expect(getByText('Today')).toBeTruthy();
    expect(getByText('$40.44')).toBeTruthy();
  });

  it('without label: a lone row is NOT aligned (no kv, no .label)', () => {
    const { container, getByText } = render(TextWidget, {
      props: { w: { type: 'text', text: '5h 3% · 1h 18m' } },
    });
    const row = container.querySelector('.text') as HTMLElement;
    expect(row.classList.contains('kv')).toBe(false);
    expect(row.querySelector('.label')).toBeNull();
    expect(getByText('5h 3% · 1h 18m')).toBeTruthy();
  });
});
