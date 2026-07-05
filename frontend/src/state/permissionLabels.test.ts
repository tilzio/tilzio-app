import { describe, it, expect } from 'vitest';
import { resolvePermission, declaredPermissions, needsConsent } from './permissionLabels';

describe('permissionLabels', () => {
  it('exec with an allow-list of binaries', () => {
    const r = resolvePermission('exec', ['git']);
    expect(r.icon).toBe('⚡');
    expect(r.title).toBe('Run commands');
    expect(r.detail).toContain('git');
    expect(r.badge).toBe('run: git');
  });

  it('exec without binaries', () => {
    expect(resolvePermission('exec', []).detail).toContain('not specified');
  });

  it('state:read', () => {
    expect(resolvePermission('state:read', []).title).toBe('Read layout');
  });

  it('terminal:write', () => {
    expect(resolvePermission('terminal:write', []).title).toBe('Paste to console');
  });

  it('terminal:read — honest text about secrets', () => {
    const l = resolvePermission('terminal:read', []);
    expect(l.title).toMatch(/Read terminal output/i);
    expect(l.detail).toMatch(/password|token|secret/i);
    expect(l.badge).toBeTruthy();
  });

  it('network permission has a human-readable English label', () => {
    const l = resolvePermission('network', []);
    expect(l.title).toBe('Network access');
    expect(l.detail).not.toBe('unknown permission');   // would be the default fallback
    expect(l.badge).toBe('network');
  });

  it('unknown permission → raw id, not dropped', () => {
    const r = resolvePermission('net', []);
    expect(r.title).toBe('net');
    expect(r.detail).toBe('unknown permission');
    expect(r.badge).toBe('net');
  });

  it('declaredPermissions / needsConsent', () => {
    expect(declaredPermissions(null)).toEqual([]);
    expect(declaredPermissions({ permissions: undefined } as any)).toEqual([]); // field is optional
    expect(declaredPermissions({ permissions: ['exec', 'state:read'] } as any)).toEqual(['exec', 'state:read']);
    expect(needsConsent(null)).toBe(false);
    expect(needsConsent({ permissions: [] } as any)).toBe(false);
    expect(needsConsent({ permissions: ['exec'] } as any)).toBe(true);
  });

  // S9.6: tone/color/bg fields for colored permission chips
  it('S9.6: tone/color/bg for exec', () => {
    const r = resolvePermission('exec', ['ssh']);
    expect(r.color).toBe('#fabd2f');
    expect(r.tone).toBeTruthy();
    expect(r.bg).toBe('rgba(250,189,47,.14)');
  });

  it('S9.6: network = aqua', () => {
    expect(resolvePermission('network', []).color).toBe('#83a598');
  });

  it('S9.6: terminal:read = red, terminal:write = accent', () => {
    expect(resolvePermission('terminal:read', []).color).toBe('#fb4934');
    expect(resolvePermission('terminal:write', []).color).toBe('#fe8019');
  });

  it('S9.6: unknown → neutral #a89984, does not throw', () => {
    const r = resolvePermission('definitely-unknown', []);
    expect(r.color).toBe('#a89984');
    expect(r.title).toBe('definitely-unknown');
    expect(r.detail).toBe('unknown permission');
  });
});
