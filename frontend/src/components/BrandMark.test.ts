// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import BrandMark from './BrandMark.svelte';

afterEach(cleanup);

describe('BrandMark', () => {
  it('renders exactly 5 <rect>', () => {
    const { container } = render(BrandMark);
    expect(container.querySelectorAll('rect').length).toBe(5);
  });
  it('svg width/height equal the size prop', () => {
    const { container } = render(BrandMark, { props: { size: 20 } });
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.getAttribute('height')).toBe('20');
  });
  it('default size === 18', () => {
    const { container } = render(BrandMark);
    expect(container.querySelector('svg')!.getAttribute('width')).toBe('18');
  });
  it('focus-rect has the expected geometry and token fill', () => {
    const { container } = render(BrandMark);
    const focus = container.querySelectorAll('rect')[1]; // bg, focus, tileTR, tileBR, cursor
    expect(focus.getAttribute('x')).toBe('176');
    expect(focus.getAttribute('width')).toBe('380');
    expect(focus.getAttribute('height')).toBe('672');
    expect(focus.getAttribute('fill')!.startsWith('var(--brand')).toBe(true);
  });
  it('all fills are var(--brand*) tokens, not literal hex', () => {
    const { container } = render(BrandMark);
    for (const r of container.querySelectorAll('rect'))
      expect(r.getAttribute('fill')!.startsWith('var(--brand')).toBe(true);
  });
  it('svg is decorative (aria-hidden)', () => {
    const { container } = render(BrandMark);
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });
});
