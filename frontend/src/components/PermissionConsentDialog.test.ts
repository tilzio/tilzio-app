// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import PermissionConsentDialog from './PermissionConsentDialog.svelte';

afterEach(cleanup);
// S9.6: fixture updated — added tone/color/bg fields (now required in PermLabel)
const perms = [{ icon: '⚡', title: 'Run commands', detail: 'allowed to run: git', badge: 'run: git', tone: 'exec', color: '#fabd2f', bg: 'rgba(250,189,47,.14)' }];
const base = { pluginName: 'Git', pluginId: 'dev.term.git', version: '1.0.0', onConfirm: vi.fn(), onCancel: vi.fn() };

describe('PermissionConsentDialog', () => {
  it('shows the name and permissions', () => {
    const { getByText } = render(PermissionConsentDialog, { props: { ...base, permissions: perms } });
    expect(getByText('Enable extension «Git»?', { exact: false })).toBeTruthy();
    expect(getByText('Run commands')).toBeTruthy();
    expect(getByText('allowed to run: git', { exact: false })).toBeTruthy();
  });

  it('Enable → onConfirm', async () => {
    const onConfirm = vi.fn();
    const { getByText } = render(PermissionConsentDialog, { props: { ...base, permissions: perms, onConfirm } });
    await fireEvent.click(getByText('Enable'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('Cancel and overlay click → onCancel', async () => {
    const onCancel = vi.fn();
    const { getByText, container } = render(PermissionConsentDialog, { props: { ...base, permissions: perms, onCancel } });
    await fireEvent.click(getByText('Cancel'));
    await fireEvent.click(container.querySelector('.overlay')!);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('empty permission list → «Requests no special permissions»', () => {
    const { getByText } = render(PermissionConsentDialog, { props: { ...base, permissions: [] } });
    expect(getByText('Requests no special permissions', { exact: false })).toBeTruthy();
  });

  // S9.5: new visual tests
  it('S9.5: avatar chip + sub with id/version', () => {
    const { container, getByText } = render(PermissionConsentDialog, { props: { ...base, permissions: perms } });
    expect(container.querySelector('.head .avatar')).not.toBeNull();
    expect(getByText('Enable extension «Git»?', { exact: false })).toBeTruthy();
    expect(getByText(/dev\.term\.git/)).toBeTruthy();
  });
  it('S9.5: permission chip with inline color', () => {
    const { container } = render(PermissionConsentDialog, { props: { ...base, permissions: perms } });
    const chip = container.querySelector('.perm .ico') as HTMLElement;
    expect(chip).not.toBeNull();
    // jsdom normalizes hex → rgb when reading the style attribute; we check via computedStyle
    const color = chip.style.color;
    // rgb(250, 189, 47) = #fabd2f
    expect(color).toMatch(/rgb\(250,\s*189,\s*47\)/);
  });
  it('S9.5: info note with a ⓘ glyph', () => {
    const { container } = render(PermissionConsentDialog, { props: { ...base, permissions: perms } });
    expect(container.querySelector('.note .note-ico')).not.toBeNull();
  });
  it('S9.5: Enable contains a dot and text, click → onConfirm', async () => {
    const onConfirm = vi.fn();
    const { container, getByText } = render(PermissionConsentDialog, { props: { ...base, permissions: perms, onConfirm } });
    expect(container.querySelector('.confirm .dot')).not.toBeNull();
    await fireEvent.click(getByText('Enable'));
    expect(onConfirm).toHaveBeenCalled();
  });
});
