import { describe, it, expect } from 'vitest';
import { computeResizeRatios } from './splitResize';

const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('computeResizeRatios', () => {
  it('redistributes the delta only between the two adjacent panes', () => {
    const start = [0.25, 0.25, 0.25, 0.25];
    const out = computeResizeRatios(start, 1, 0.1, 0.05);
    // The dragged divider sits between panes 1 and 2 — only those two move.
    expect(out[1]).toBeCloseTo(0.35);
    expect(out[2]).toBeCloseTo(0.15);
    // Every other pane keeps its exact starting ratio.
    expect(out[0]).toBe(0.25);
    expect(out[3]).toBe(0.25);
  });

  it('does not mutate the input array', () => {
    const start = [0.5, 0.5];
    const snapshot = [...start];
    computeResizeRatios(start, 0, 0.2, 0.05);
    expect(start).toEqual(snapshot);
  });

  it('clamps the index pane so it cannot shrink below minFrac', () => {
    // Drag far toward pane `index` — it would otherwise collapse past the floor.
    const out = computeResizeRatios([0.5, 0.5], 0, -0.4, 0.2);
    expect(out[0]).toBeCloseTo(0.2); // pinned at the minimum
    expect(out[1]).toBeCloseTo(0.8); // neighbour absorbs the surplus
  });

  it('clamps the neighbour pane so it cannot shrink below minFrac', () => {
    // Drag far toward pane `index + 1` — the min-clamp must hold on this side too.
    const out = computeResizeRatios([0.5, 0.5], 0, 0.4, 0.2);
    expect(out[1]).toBeCloseTo(0.2); // pinned at the minimum
    expect(out[0]).toBeCloseTo(0.8);
  });

  it('the border sticks: overshooting past the clamp does not move it further', () => {
    const clamped = computeResizeRatios([0.5, 0.5], 0, -0.4, 0.2);
    const overshot = computeResizeRatios([0.5, 0.5], 0, -0.9, 0.2); // pushed much harder
    expect(overshot[0]).toBeCloseTo(clamped[0]);
    expect(overshot[1]).toBeCloseTo(clamped[1]);
    expect(overshot[0]).toBeCloseTo(0.2); // still pinned at the floor
  });

  it('preserves the total of all ratios', () => {
    const start = [0.2, 0.3, 0.5];
    expect(total(computeResizeRatios(start, 0, 0.07, 0.05))).toBeCloseTo(total(start));
    expect(total(computeResizeRatios(start, 1, -0.07, 0.05))).toBeCloseTo(total(start));
    // ...and the total holds even when a side is clamped.
    expect(total(computeResizeRatios([0.5, 0.5], 0, -0.4, 0.2))).toBeCloseTo(1);
    expect(total(computeResizeRatios([0.5, 0.5], 0, 0.4, 0.2))).toBeCloseTo(1);
  });
});
