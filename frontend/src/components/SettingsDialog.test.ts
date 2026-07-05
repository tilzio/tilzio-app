// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import SettingsDialog from './SettingsDialog.svelte';

afterEach(cleanup);

const base = {
  activeColor: '#fe8019', exitColor: '#fb4934', alertColor: '#2bd9c4',
  uiFont: 'mono' as const, uiFontSize: 13,
  termFontSize: 13, editorFontSize: 13,
  onActiveColor: () => {}, onExitColor: () => {}, onAlertColor: () => {},
  onFont: () => {}, onSize: () => {}, onTermSize: () => {}, onEditorSize: () => {},
  onReset: () => {}, onClose: () => {},
  locale: 'en', onLocale: () => {},
};

describe('SettingsDialog', () => {
  it('clicking a preset swatch in Notifications → onAlertColor(name)', async () => {
    const onAlertColor = vi.fn();
    const { getByLabelText } = render(SettingsDialog, { props: { ...base, onAlertColor } });
    await fireEvent.click(getByLabelText('Notifications: magenta'));
    expect(onAlertColor).toHaveBeenCalledWith('magenta');
  });
  it('clicking a preset swatch in Active pane → onActiveColor(name)', async () => {
    const onActiveColor = vi.fn();
    const { getByLabelText } = render(SettingsDialog, { props: { ...base, onActiveColor } });
    await fireEvent.click(getByLabelText('Active pane: green'));
    expect(onActiveColor).toHaveBeenCalledWith('green');
  });
  it('hex chip shows the current value and the indicator dot is colored', () => {
    const { getByText, getByTestId } = render(SettingsDialog, { props: base });
    expect(getByText('#fe8019')).toBeTruthy();              // Active pane hex chip
    const dot = getByTestId('state-dot-Exited console');
    expect((dot as HTMLElement).style.background).toBe('rgb(251, 73, 52)'); // #fb4934
  });
  it('custom color input for Exited console → onExitColor(hex)', async () => {
    const onExitColor = vi.fn();
    const { getByLabelText } = render(SettingsDialog, { props: { ...base, onExitColor } });
    const input = getByLabelText('Exited console: custom hex') as HTMLInputElement;
    input.value = '#123456';
    await fireEvent.input(input);
    expect(onExitColor).toHaveBeenCalledWith('#123456');
  });
  it('LIVE PREVIEW: three tiles, the active dot is colored with activeColor', () => {
    const { getByTestId } = render(SettingsDialog, { props: { ...base, activeColor: '#00ff00' } });
    expect(getByTestId('preview-active')).toBeTruthy();
    expect(getByTestId('preview-notif')).toBeTruthy();
    expect(getByTestId('preview-exit')).toBeTruthy();
    const dot = getByTestId('preview-active-dot') as HTMLElement;
    expect(dot.style.background).toBe('rgb(0, 255, 0)');
  });
  it('LABEL FONT: changing the select → onFont(serif)', async () => {
    const onFont = vi.fn();
    const { getByLabelText } = render(SettingsDialog, { props: { ...base, onFont } });
    await fireEvent.change(getByLabelText('label font family'), { target: { value: 'serif' } });
    expect(onFont).toHaveBeenCalledWith('serif');
  });
  it('LANGUAGE: dropdown shows the current locale', () => {
    const { getByLabelText } = render(SettingsDialog, { props: { ...base, locale: 'en' } });
    const sel = getByLabelText('language') as HTMLSelectElement;
    expect(sel.value).toBe('en');
  });
  it('LABEL FONT: increase size → onSize(14)', async () => {
    const onSize = vi.fn();
    const { getByLabelText } = render(SettingsDialog, { props: { ...base, onSize } });
    await fireEvent.click(getByLabelText('increase size'));
    expect(onSize).toHaveBeenCalledWith(14);
  });
  it('stepper + → onSize(14)', async () => {
    const onSize = vi.fn();
    const { getByLabelText } = render(SettingsDialog, { props: { ...base, onSize } });
    await fireEvent.click(getByLabelText('increase size'));
    expect(onSize).toHaveBeenCalledWith(14);
  });
  it('stepper − at the minimum clamps to 9', async () => {
    const onSize = vi.fn();
    const { getByLabelText } = render(SettingsDialog, { props: { ...base, uiFontSize: 9, onSize } });
    await fireEvent.click(getByLabelText('decrease size'));
    expect(onSize).toHaveBeenCalledWith(9);
  });
  it('terminal stepper "+" → onTermSize(14)', async () => {
    const onTermSize = vi.fn();
    const { getByLabelText, getByRole } = render(SettingsDialog, { props: { ...base, onTermSize } });
    // Switch to the Terminal tab, where CONTENT FONT SIZE lives
    await fireEvent.click(getByRole('button', { name: 'Terminal' }));
    await fireEvent.click(getByLabelText('increase terminal size'));
    expect(onTermSize).toHaveBeenCalledWith(14);
  });
  it('editor stepper "−" → onEditorSize(12)', async () => {
    const onEditorSize = vi.fn();
    const { getByLabelText, getByRole } = render(SettingsDialog, { props: { ...base, onEditorSize } });
    // Switch to the Editor tab, where CONTENT FONT SIZE lives
    await fireEvent.click(getByRole('button', { name: 'Editor' }));
    await fireEvent.click(getByLabelText('decrease editor size'));
    expect(onEditorSize).toHaveBeenCalledWith(12);
  });
  it('Reset to defaults → onReset', async () => {
    const onReset = vi.fn();
    const { getByText } = render(SettingsDialog, { props: { ...base, onReset } });
    await fireEvent.click(getByText('Reset to defaults'));
    expect(onReset).toHaveBeenCalled();
  });
  it('Done → onClose', async () => {
    const onClose = vi.fn();
    const { getByText } = render(SettingsDialog, { props: { ...base, onClose } });
    await fireEvent.click(getByText('Done'));
    expect(onClose).toHaveBeenCalled();
  });
  it('clicking the overlay → onClose (preserved)', async () => {
    const onClose = vi.fn();
    const { getByRole } = render(SettingsDialog, { props: { ...base, onClose } });
    await fireEvent.click(getByRole('presentation'));
    expect(onClose).toHaveBeenCalled();
  });

  // --- S7.2: window scaffold (left column of categories) ---
  it('renders 6 category buttons, Appearance is active', () => {
    const { getByRole } = render(SettingsDialog, { props: base });
    for (const n of ['Appearance', 'Terminal', 'Editor', 'Keymap', 'Extensions', 'About'])
      expect(getByRole('button', { name: n })).toBeTruthy();
    expect(getByRole('button', { name: 'Appearance' }).getAttribute('aria-current')).toBe('page');
  });
  it('clicking Terminal → aria-current moves, section title = Terminal', async () => {
    const { getByRole, getByText } = render(SettingsDialog, { props: base });
    await fireEvent.click(getByRole('button', { name: 'Terminal' }));
    expect(getByRole('button', { name: 'Terminal' }).getAttribute('aria-current')).toBe('page');
    expect(getByText('Terminal', { selector: '.sec-title' })).toBeTruthy();
  });
  it('clicking ✕ → onClose', async () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(SettingsDialog, { props: { ...base, onClose } });
    await fireEvent.click(getByLabelText('Close settings'));
    expect(onClose).toHaveBeenCalled();
  });

  // --- S7.5: Terminal / Editor / Keymap / Extensions / About tabs ---
  it('Terminal tab: increase terminal size → onTermSize(14)', async () => {
    const onTermSize = vi.fn();
    const { getByRole, getByLabelText } = render(SettingsDialog, { props: { ...base, onTermSize } });
    await fireEvent.click(getByRole('button', { name: 'Terminal' }));
    await fireEvent.click(getByLabelText('increase terminal size'));
    expect(onTermSize).toHaveBeenCalledWith(14);
  });
  it('Editor tab: decrease editor size from 13 → onEditorSize(12)', async () => {
    const onEditorSize = vi.fn();
    const { getByRole, getByLabelText } = render(SettingsDialog, { props: { ...base, editorFontSize: 13, onEditorSize } });
    await fireEvent.click(getByRole('button', { name: 'Editor' }));
    await fireEvent.click(getByLabelText('decrease editor size'));
    expect(onEditorSize).toHaveBeenCalledWith(12);
  });
  it('Keymap tab: has ⌘T / New tab', async () => {
    const { getByRole, getByText } = render(SettingsDialog, { props: base });
    await fireEvent.click(getByRole('button', { name: 'Keymap' }));
    expect(getByText('⌘T')).toBeTruthy();
    expect(getByText('New tab')).toBeTruthy();
  });
  it('Extensions tab: clicking Open Extensions → onOpenExtensions', async () => {
    const onOpenExtensions = vi.fn();
    const { getByRole, getByText } = render(SettingsDialog, { props: { ...base, onOpenExtensions } });
    await fireEvent.click(getByRole('button', { name: 'Extensions' }));
    await fireEvent.click(getByText('Open Extensions →'));
    expect(onOpenExtensions).toHaveBeenCalled();
  });
  it('About tab: Tilzio + version from the prop', async () => {
    const { getByRole, getByText } = render(SettingsDialog, { props: { ...base, appVersion: '1.2.3' } });
    await fireEvent.click(getByRole('button', { name: 'About' }));
    expect(getByText('Tilzio')).toBeTruthy();
    expect(getByText('1.2.3')).toBeTruthy();
  });
});
