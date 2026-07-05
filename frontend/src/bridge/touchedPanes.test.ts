import { describe, it, expect, afterEach } from 'vitest';
import { touchedPanes, __resetForTests } from './touchedPanes';

afterEach(__resetForTests);

describe('touchedPanes', () => {
  it('is not touched by default', () => {
    expect(touchedPanes.isTouched('p1')).toBe(false);
  });

  it('marks a pane as touched', () => {
    touchedPanes.mark('p1');
    expect(touchedPanes.isTouched('p1')).toBe(true);
  });

  it('tracks panes independently', () => {
    touchedPanes.mark('p1');
    expect(touchedPanes.isTouched('p2')).toBe(false);
  });

  it('__resetForTests clears state', () => {
    touchedPanes.mark('p1');
    __resetForTests();
    expect(touchedPanes.isTouched('p1')).toBe(false);
  });
});
