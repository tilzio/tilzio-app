// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import ChartWidget from './ChartWidget.svelte';

afterEach(cleanup);

describe('ChartWidget tone', () => {
  it('bar: tone colors the fill, without tone — accent', () => {
    const { container } = render(ChartWidget, { props: { w: { type: 'chart', kind: 'bar', bars: [{ label: 'a', value: 1, tone: 'warn' }, { label: 'b', value: 2 }] } } });
    const html = container.innerHTML;
    expect(html).toContain('var(--amber)');   // tone:'warn'
    expect(html).toContain('var(--accent)');  // without tone — default
  });

  it('ring: tone colors the arc stroke', () => {
    const { container } = render(ChartWidget, { props: { w: { type: 'chart', kind: 'ring', segments: [{ label: '5h', value: 82, tone: 'error' }], max: 100 } } });
    const arc = container.querySelectorAll('circle')[1]; // [0] — background track, [1] — arc
    expect(arc.getAttribute('stroke')).toBe('var(--red)');
  });
});
