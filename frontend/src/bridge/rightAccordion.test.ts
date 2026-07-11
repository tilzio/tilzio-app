import { describe, it, expect, afterEach } from 'vitest';
import { rightAccordion, openRightPanel, closeRightPanel, toggleRightCollapsed, isRightCollapsed, pruneRightPanels, __resetForTests } from './rightAccordion.svelte';

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
  it('pruneRightPanels drops stale ids while keeping valid ones and their collapsed state', () => {
    openRightPanel('a'); openRightPanel('b'); openRightPanel('c');
    toggleRightCollapsed('b'); // b is collapsed; a, c are not
    pruneRightPanels(['a', 'b']); // c is no longer valid (plugin disabled/removed)
    expect(rightAccordion.open).toEqual(['a', 'b']);
    expect(isRightCollapsed('a')).toBe(false);
    expect(isRightCollapsed('b')).toBe(true);
    expect(rightAccordion.collapsed).not.toHaveProperty('c');
  });
  it('pruneRightPanels is a no-op when all ids are still valid', () => {
    openRightPanel('a'); openRightPanel('b');
    pruneRightPanels(['a', 'b']);
    expect(rightAccordion.open).toEqual(['a', 'b']);
  });
  it('pruneRightPanels removes everything when no ids are valid', () => {
    openRightPanel('a'); openRightPanel('b');
    pruneRightPanels([]);
    expect(rightAccordion.open).toEqual([]);
    expect(rightAccordion.collapsed).toEqual({});
  });
});
