// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import WidgetRenderer from './WidgetRenderer.svelte';
import type { Widget } from '../state/widgets';

afterEach(cleanup);

describe('WidgetRenderer', () => {
  it('renders text (label + value)', () => {
    const widgets: Widget[] = [{ type: 'text', text: 'main', label: 'branch', tone: 'default' }];
    const { getByText } = render(WidgetRenderer, { props: { widgets } });
    expect(getByText('branch')).toBeTruthy();
    expect(getByText('main')).toBeTruthy();
  });

  it('text is output escaped (not as HTML)', () => {
    const widgets: Widget[] = [{ type: 'text', text: '<b>x</b>', tone: 'default' }];
    const { container, getByText } = render(WidgetRenderer, { props: { widgets } });
    expect(getByText('<b>x</b>')).toBeTruthy();      // literal text
    expect(container.querySelector('b')).toBeNull(); // not parsed into an element
  });

  it('renders badge items', () => {
    const widgets: Widget[] = [{ type: 'badge', items: [{ text: '3 ✎', tone: 'warn' }] }];
    const { getByText } = render(WidgetRenderer, { props: { widgets } });
    expect(getByText('3 ✎')).toBeTruthy();
  });

  it('an unknown type is skipped without crashing', () => {
    const widgets = [{ type: 'nope' } as unknown as Widget, { type: 'text', text: 'ok', tone: 'default' } as Widget];
    const { getByText } = render(WidgetRenderer, { props: { widgets } });
    expect(getByText('ok')).toBeTruthy();
  });

  it('list: clicking a row with a command calls onCommand', async () => {
    const onCommand = vi.fn();
    const widgets: Widget[] = [{ type: 'list', items: [
      { text: 'A', tone: 'default', command: 'c1', args: { n: 1 } },
      { text: 'B', tone: 'default' },
    ] }];
    const { getByText } = render(WidgetRenderer, { props: { widgets, onCommand } });
    await fireEvent.click(getByText('A'));
    expect(onCommand).toHaveBeenCalledWith('c1', { n: 1 });
    await fireEvent.click(getByText('B')); // without a command — no call
    expect(onCommand).toHaveBeenCalledTimes(1);
  });

  it('buttons: clicking calls onCommand', async () => {
    const onCommand = vi.fn();
    const widgets: Widget[] = [{ type: 'buttons', items: [{ text: 'Refresh', command: 'refresh' }] }];
    const { getByText } = render(WidgetRenderer, { props: { widgets, onCommand } });
    await fireEvent.click(getByText('Refresh'));
    expect(onCommand).toHaveBeenCalledWith('refresh', undefined);
  });

  it('table: renders headers and cells', () => {
    const widgets: Widget[] = [{ type: 'table', columns: ['file', '+'], rows: [['App.svelte', '12'], ['List.svelte', '40']] }];
    const { getByText } = render(WidgetRenderer, { props: { widgets } });
    expect(getByText('file')).toBeTruthy();
    expect(getByText('App.svelte')).toBeTruthy();
    expect(getByText('40')).toBeTruthy();
  });

  it('chart line: draws a polyline and caption', () => {
    const widgets: Widget[] = [{ type: 'chart', kind: 'line', values: [1, 5, 3], caption: 'CPU' }];
    const { container, getByText } = render(WidgetRenderer, { props: { widgets } });
    expect(getByText('CPU')).toBeTruthy();
    expect(container.querySelector('polyline')).toBeTruthy();
  });

  it('chart bar: draws a bar for each bar', () => {
    const widgets: Widget[] = [{ type: 'chart', kind: 'bar', bars: [{ label: 'ts', value: 8 }, { label: 'go', value: 4 }] }];
    const { container } = render(WidgetRenderer, { props: { widgets } });
    expect(container.querySelectorAll('.bar').length).toBe(2);
  });

  it('chart ring: draws a circle for each segment (+track)', () => {
    const widgets: Widget[] = [{ type: 'chart', kind: 'ring', segments: [{ label: 'a', value: 7 }], max: 10 }];
    const { container } = render(WidgetRenderer, { props: { widgets } });
    expect(container.querySelectorAll('circle').length).toBeGreaterThanOrEqual(2);
  });

  it('chart ring (gauge): draws % in the center', () => {
    const widgets: Widget[] = [{ type: 'chart', kind: 'ring', segments: [{ label: 'used', value: 73 }], max: 100 }];
    const { getByText } = render(WidgetRenderer, { props: { widgets } });
    expect(getByText('73%')).toBeTruthy();
  });

  it('chart ring (donut, >1 segment): no center label', () => {
    const widgets: Widget[] = [{ type: 'chart', kind: 'ring', segments: [{ label: 'a', value: 1 }, { label: 'b', value: 1 }] }];
    const { container } = render(WidgetRenderer, { props: { widgets } });
    expect(container.querySelector('text')).toBeNull();
  });

  it('chart ring gauge: fill arc with rounded caps', () => {
    const widgets: Widget[] = [{ type: 'chart', kind: 'ring', segments: [{ label: 'used', value: 73 }], max: 100 }];
    const { container } = render(WidgetRenderer, { props: { widgets } });
    const circles = container.querySelectorAll('circle');
    const arc = circles[circles.length - 1]; // the last circle — the segment arc (the first — the track)
    expect(arc.getAttribute('stroke-linecap')).toBe('round');
  });

  it('chart ring donut: legend with label and %', () => {
    const widgets: Widget[] = [{ type: 'chart', kind: 'ring', segments: [{ label: 'ts', value: 40 }, { label: 'go', value: 60 }] }];
    const { getByText } = render(WidgetRenderer, { props: { widgets } });
    expect(getByText('ts 40%')).toBeTruthy();
    expect(getByText('go 60%')).toBeTruthy();
  });

  it('chart bar with percent: shows shares above the bars', () => {
    const widgets: Widget[] = [{ type: 'chart', kind: 'bar', bars: [{ label: 'a', value: 25 }, { label: 'b', value: 75 }], percent: true }];
    const { getByText } = render(WidgetRenderer, { props: { widgets } });
    expect(getByText('25%')).toBeTruthy();
    expect(getByText('75%')).toBeTruthy();
  });

  it('chart bar without percent: no percentages', () => {
    const widgets: Widget[] = [{ type: 'chart', kind: 'bar', bars: [{ label: 'a', value: 25 }] }];
    const { container } = render(WidgetRenderer, { props: { widgets } });
    expect(container.querySelector('.val')).toBeNull();
  });

  it('chart with empty data does not crash', () => {
    const widgets: Widget[] = [
      { type: 'chart', kind: 'line', values: [] },
      { type: 'chart', kind: 'bar', bars: [] },
      { type: 'chart', kind: 'ring', segments: [] },
    ];
    const { container } = render(WidgetRenderer, { props: { widgets } });
    expect(container.querySelector('polyline')).toBeTruthy(); // line renders with empty points
    expect(container.querySelectorAll('.bar').length).toBe(0); // no bars
  });
});
