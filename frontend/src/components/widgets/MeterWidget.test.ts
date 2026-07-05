// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import MeterWidget from './MeterWidget.svelte';

afterEach(cleanup);

describe('MeterWidget', () => {
  it('fill width is proportional to value/max', () => {
    const { container } = render(MeterWidget, { props: { w: { type: 'meter', label: '5h', value: 50, max: 100 } } });
    expect((container.querySelector('.m-fill') as HTMLElement).style.width).toBe('50%');
  });
  it('value > max is clamped to 100%', () => {
    const { container } = render(MeterWidget, { props: { w: { type: 'meter', value: 150, max: 100 } } });
    expect((container.querySelector('.m-fill') as HTMLElement).style.width).toBe('100%');
  });
  it('tone colors the fill', () => {
    const { container } = render(MeterWidget, { props: { w: { type: 'meter', value: 90, max: 100, tone: 'error' } } });
    expect(container.innerHTML).toContain('var(--red)');
  });
  it('color overrides tone', () => {
    const { container } = render(MeterWidget, { props: { w: { type: 'meter', value: 10, max: 100, tone: 'error', color: '#abcdef' } } });
    // jsdom normalizes #abcdef → rgb(171, 205, 239) in inline styles
    expect(container.innerHTML).toContain('rgb(171, 205, 239)');
    expect(container.innerHTML).not.toContain('var(--red)');
  });
  it('without tone/color — accent', () => {
    const { container } = render(MeterWidget, { props: { w: { type: 'meter', value: 10, max: 100 } } });
    expect(container.innerHTML).toContain('var(--accent)');
  });
  it('label/text/caption are rendered', () => {
    const { getByText } = render(MeterWidget, { props: { w: { type: 'meter', label: '5h', value: 82, max: 100, text: '82%', caption: '2h15m' } } });
    expect(getByText('5h')).toBeTruthy();
    expect(getByText('82%')).toBeTruthy();
    expect(getByText('2h15m')).toBeTruthy();
  });
});
