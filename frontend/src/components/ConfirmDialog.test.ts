// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import ConfirmDialog from './ConfirmDialog.svelte';

afterEach(cleanup);

describe('ConfirmDialog', () => {
  it('shows the message', () => {
    const { getByText } = render(ConfirmDialog, { props: { message: 'Close space?', onConfirm: vi.fn(), onCancel: vi.fn() } });
    expect(getByText('Close space?', { exact: false })).toBeTruthy();
  });

  it('confirm button fires onConfirm', async () => {
    const onConfirm = vi.fn();
    const { getByText } = render(ConfirmDialog, { props: { message: 'x', onConfirm, onCancel: vi.fn() } });
    await fireEvent.click(getByText('Close'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('cancel button fires onCancel', async () => {
    const onCancel = vi.fn();
    const { getByText } = render(ConfirmDialog, { props: { message: 'x', onConfirm: vi.fn(), onCancel } });
    await fireEvent.click(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('clicking the overlay cancels', async () => {
    const onCancel = vi.fn();
    const { container } = render(ConfirmDialog, { props: { message: 'x', onConfirm: vi.fn(), onCancel } });
    await fireEvent.click(container.querySelector('.overlay')!);
    expect(onCancel).toHaveBeenCalled();
  });

  it('uses a custom confirm label', () => {
    const { getByText } = render(ConfirmDialog, { props: { message: 'x', confirmLabel: 'Delete', onConfirm: vi.fn(), onCancel: vi.fn() } });
    expect(getByText('Delete')).toBeTruthy();
  });

  it('clicking inside the dialog does not cancel', async () => {
    const onCancel = vi.fn();
    const { container } = render(ConfirmDialog, { props: { message: 'x', onConfirm: vi.fn(), onCancel } });
    await fireEvent.click(container.querySelector('.dialog')!);
    expect(onCancel).not.toHaveBeenCalled();
  });

  // Restyle anchor: the .dialog/.cancel/.confirm structure is intact after S9.1 (CSS-only)
  it('renders restyled shell with .dialog/.cancel/.confirm intact', () => {
    const { container, getByText } = render(ConfirmDialog, { props: { message: 'x', onConfirm: vi.fn(), onCancel: vi.fn() } });
    expect(container.querySelector('.dialog')).not.toBeNull();
    expect(container.querySelector('.cancel')).not.toBeNull();
    expect(container.querySelector('.confirm')).not.toBeNull();
    expect(getByText('Close')).toBeTruthy();
  });

  // S9.7: chip by tone, tone/icon/highlight props, name highlight via split (without {@html})
  it('S9.7: tone=danger (default) — danger chip + red .confirm', () => {
    const { container } = render(ConfirmDialog, { props: { message: 'x', onConfirm: vi.fn(), onCancel: vi.fn() } });
    expect(container.querySelector('.chip.danger')).not.toBeNull();
  });
  it('S9.7: tone=accent + icon ↻ — accent chip', () => {
    const { container } = render(ConfirmDialog, { props: { message: 'x', tone: 'accent', icon: '↻', onConfirm: vi.fn(), onCancel: vi.fn() } });
    expect(container.querySelector('.chip.accent')).not.toBeNull();
    expect(container.querySelector('.confirm.accent')).not.toBeNull();
  });
  it('S9.7: highlight wraps the name in <b>', () => {
    const { container } = render(ConfirmDialog, { props: { message: '«users.ts» changed', highlight: 'users.ts', onConfirm: vi.fn(), onCancel: vi.fn() } });
    expect(container.querySelector('.msg b')?.textContent).toBe('users.ts');
  });
  it('S9.7: XSS — tags in message/highlight render as text', () => {
    const { container } = render(ConfirmDialog, { props: { message: '<img src=x onerror=alert(1)> bad', highlight: '<img src=x onerror=alert(1)>', onConfirm: vi.fn(), onCancel: vi.fn() } });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });
});
