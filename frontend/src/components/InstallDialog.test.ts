// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import InstallDialog from './InstallDialog.svelte';

afterEach(cleanup);

const base = {
  status: 'idle' as const, errorMsg: '', conflict: null,
  onFileBytes: vi.fn(), onUrl: vi.fn(), onConfirmOverwrite: vi.fn(), onClose: vi.fn(),
};

describe('InstallDialog', () => {
  it('selecting a file yields bytes in onFileBytes', async () => {
    const onFileBytes = vi.fn();
    const { container } = render(InstallDialog, { props: { ...base, onFileBytes } });
    // fake file with its own arrayBuffer — we don't rely on jsdom Blob.
    const file = { name: 'p.zip', arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as unknown as File;
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    await fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onFileBytes).toHaveBeenCalled());
    expect(Array.from(onFileBytes.mock.calls[0][0] as Uint8Array)).toEqual([1, 2, 3]);
  });

  it('the «Download» button calls onUrl with the entered address', async () => {
    const onUrl = vi.fn();
    const { getByPlaceholderText, getByText } = render(InstallDialog, { props: { ...base, onUrl } });
    await fireEvent.input(getByPlaceholderText('https://…/plugin.zip'), { target: { value: 'https://x/p.zip' } });
    await fireEvent.click(getByText('Download'));
    expect(onUrl).toHaveBeenCalledWith('https://x/p.zip');
  });

  it('status=busy blocks «Close»', () => {
    const { getByLabelText } = render(InstallDialog, { props: { ...base, status: 'busy' } });
    expect((getByLabelText('Close') as HTMLButtonElement).disabled).toBe(true);
  });

  // S9.4: ✕ icon instead of a textual «Close»
  it('close button is a ✕ icon with aria-label, click calls onClose', async () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(InstallDialog, { props: { ...base, onClose } });
    const btn = getByLabelText('Close') as HTMLButtonElement;
    expect(btn.textContent?.trim()).toBe('✕');
    await fireEvent.click(btn);
    expect(onClose).toHaveBeenCalled();
  });
  it('autofocus on the close button', () => {
    const { getByLabelText } = render(InstallDialog, { props: { ...base } });
    expect(document.activeElement).toBe(getByLabelText('Close'));
  });

  it('status=error shows the message', () => {
    const { getByText } = render(InstallDialog, { props: { ...base, status: 'error', errorMsg: 'unsafe URL' } });
    expect(getByText('unsafe URL', { exact: false })).toBeTruthy();
  });

  it('status=conflict: versions + «Replace» calls onConfirmOverwrite', async () => {
    const onConfirmOverwrite = vi.fn();
    const { getByText } = render(InstallDialog, {
      props: { ...base, status: 'conflict', conflict: { id: 'p', existingVersion: '1.0.0', newVersion: '2.0.0' }, onConfirmOverwrite },
    });
    // v prefix from the new .ver-row
    expect(getByText('v1.0.0', { exact: false })).toBeTruthy();
    expect(getByText('v2.0.0', { exact: false })).toBeTruthy();
    await fireEvent.click(getByText('Replace'));
    expect(onConfirmOverwrite).toHaveBeenCalled();
  });

  // S9.3: chip title + framed version row with an arrow
  it('conflict: chip title + framed version row with an arrow', () => {
    const { getByText, container } = render(InstallDialog, {
      props: { ...base, status: 'conflict', conflict: { id: 'sys-monitor', existingVersion: '0.9.1', newVersion: '1.0.0' } },
    });
    expect(getByText('Extension already installed', { exact: false })).toBeTruthy();
    expect(getByText(/sys-monitor/)).toBeTruthy();
    const row = container.querySelector('.ver-row');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('v0.9.1');
    expect(row!.textContent).toContain('v1.0.0');
    expect(row!.textContent).toContain('→');
  });

  it('overlay click closes when not busy', async () => {
    const onClose = vi.fn();
    const { container } = render(InstallDialog, { props: { ...base, onClose } });
    await fireEvent.click(container.querySelector('.overlay')!);
    expect(onClose).toHaveBeenCalled();
  });

  it('overlay click does NOT close when busy', async () => {
    const onClose = vi.fn();
    const { container } = render(InstallDialog, { props: { ...base, status: 'busy', onClose } });
    await fireEvent.click(container.querySelector('.overlay')!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Enter in URL field calls onUrl', async () => {
    const onUrl = vi.fn();
    const { getByPlaceholderText } = render(InstallDialog, { props: { ...base, onUrl } });
    const field = getByPlaceholderText('https://…/plugin.zip');
    await fireEvent.input(field, { target: { value: 'https://x/p.zip' } });
    await fireEvent.keyDown(field, { key: 'Enter' });
    expect(onUrl).toHaveBeenCalledWith('https://x/p.zip');
  });

  it('status=busy blocks file selection (input disabled)', () => {
    const { container } = render(InstallDialog, { props: { ...base, status: 'busy' } });
    expect((container.querySelector('input[type=file]') as HTMLInputElement).disabled).toBe(true);
  });

  // S9.2: drop zone upload SVG + «or from URL» hairline lines
  it('drop zone contains an upload SVG', () => {
    const { container } = render(InstallDialog, { props: { ...base } });
    expect(container.querySelector('.drop svg')).not.toBeNull();
  });
  it('the «or from URL» separator has exactly 2 hairline lines', () => {
    const { container, getByText } = render(InstallDialog, { props: { ...base } });
    expect(container.querySelectorAll('.or .or-line').length).toBe(2);
    expect(getByText('or from URL', { exact: false })).toBeTruthy();
  });
  it('drop zone substring «or click to choose a file»', () => {
    const { getByText } = render(InstallDialog, { props: { ...base } });
    expect(getByText('or click to choose a file', { exact: false })).toBeTruthy();
  });
});
