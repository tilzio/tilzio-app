import { describe, it, expect, afterEach } from 'vitest';
import { alerts, bell, clearAlerts, __resetForTests, recordBell } from './alerts.svelte';

afterEach(__resetForTests);

describe('alerts holder', () => {
  it('bell increments the counter by paneId', () => {
    bell('a'); bell('a'); bell('b');
    expect(alerts.counts.a).toBe(2);
    expect(alerts.counts.b).toBe(1);
  });
  it('clearAlerts removes the counter', () => {
    bell('a'); clearAlerts('a');
    expect(alerts.counts.a).toBeUndefined();
  });
  it('clearAlerts without a counter — is safe', () => {
    expect(() => clearAlerts('nope')).not.toThrow();
  });
  it('__resetForTests clears everything', () => {
    bell('a'); bell('b'); __resetForTests();
    expect(Object.keys(alerts.counts)).toHaveLength(0);
  });
});

describe('recordBell', () => {
  it('increments an inactive pane by count', () => {
    recordBell('a', 2, 'b');
    expect(alerts.counts.a).toBe(2);
  });
  it('ignores the active visible pane', () => {
    recordBell('b', 3, 'b');
    expect(alerts.counts.b).toBeUndefined();
  });
  it('count 0 does nothing', () => {
    recordBell('c', 0, 'x');
    expect(alerts.counts.c).toBeUndefined();
  });
});
