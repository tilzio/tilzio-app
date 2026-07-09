import { describe, it, expect, afterEach } from 'vitest';
import { rightAccordion, openRightPanel, closeRightPanel, toggleRightCollapsed, isRightCollapsed, __resetForTests } from './rightAccordion.svelte';

afterEach(() => __resetForTests());

describe('rightAccordion', () => {
  it('open adds once and keeps expanded', () => {
    openRightPanel('a'); openRightPanel('a'); openRightPanel('b');
    expect(rightAccordion.open).toEqual(['a', 'b']);
    expect(isRightCollapsed('a')).toBe(false);
  });
  it('toggle collapses and expands', () => {
    openRightPanel('a');
    toggleRightCollapsed('a');
    expect(isRightCollapsed('a')).toBe(true);
    toggleRightCollapsed('a');
    expect(isRightCollapsed('a')).toBe(false);
  });
  it('close removes from open and collapsed', () => {
    openRightPanel('a'); toggleRightCollapsed('a');
    closeRightPanel('a');
    expect(rightAccordion.open).toEqual([]);
    expect(isRightCollapsed('a')).toBe(false);
  });
});
