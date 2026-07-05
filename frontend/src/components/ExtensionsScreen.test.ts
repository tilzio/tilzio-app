// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import ExtensionsScreen from './ExtensionsScreen.svelte';
import type { PluginInfo } from '../bridge/plugins';

afterEach(cleanup);

const git: PluginInfo = {
  dir: '/p/git', enabled: true, permissions: [], err: '',
  manifest: { id: 'dev.term.git', name: 'Git', version: '1.0.0', engine: 'tilzio@1', entry: 'main.js', permissions: ['exec', 'state:read', 'terminal:write'], exec: ['git'] },
};
const demo: PluginInfo = {
  dir: '/p/demo', enabled: false, permissions: [], err: '',
  manifest: { id: 'dev.term.demo', name: 'Demo', version: '1.0.0', engine: 'tilzio@1', entry: 'main.js', permissions: [] },
};
const broken: PluginInfo = { dir: '/p/x', enabled: false, permissions: [], err: 'manifest: id field is missing', manifest: null };

const base = { runtimeErrorFor: () => null, busyId: null as string | null, onToggle: vi.fn(), onRefresh: vi.fn(), onClose: vi.fn(), onInstall: vi.fn(), onUninstall: vi.fn(), onOpenDetail: vi.fn() };

describe('ExtensionsScreen', () => {
  it('renders name, version, id, permission badges', () => {
    const { getByText } = render(ExtensionsScreen, { props: { ...base, plugins: [git] } });
    expect(getByText('Git')).toBeTruthy();
    expect(getByText('v1.0.0 · dev.term.git', { exact: false })).toBeTruthy();
    expect(getByText('⚡ run: git', { exact: false })).toBeTruthy();
    expect(getByText('👁 read layout', { exact: false })).toBeTruthy();
    expect(getByText('enabled')).toBeTruthy();
  });

  it('plugin without permissions → «requests no permissions», status off', () => {
    const { getByText } = render(ExtensionsScreen, { props: { ...base, plugins: [demo] } });
    expect(getByText('requests no permissions', { exact: false })).toBeTruthy();
    expect(getByText('disabled')).toBeTruthy();
  });

  it('broken plugin: status «error» + toggle disabled', () => {
    const { getByText, container } = render(ExtensionsScreen, { props: { ...base, plugins: [broken] } });
    expect(getByText('error:', { exact: false })).toBeTruthy();
    expect((container.querySelector('.toggle') as HTMLButtonElement).disabled).toBe(true);
  });

  it('toggle calls onToggle(info, !enabled)', async () => {
    const onToggle = vi.fn();
    const { container } = render(ExtensionsScreen, { props: { ...base, plugins: [demo], onToggle } });
    await fireEvent.click(container.querySelector('.toggle')!);
    expect(onToggle).toHaveBeenCalledWith(demo, true);
  });

  it('busyId blocks the toggle', () => {
    const { container } = render(ExtensionsScreen, { props: { ...base, plugins: [demo], busyId: 'dev.term.demo' } });
    expect((container.querySelector('.toggle') as HTMLButtonElement).disabled).toBe(true);
  });

  it("rtErr shows the worker activation error", () => {
    const { getByText } = render(ExtensionsScreen, { props: { ...base, plugins: [git], runtimeErrorFor: () => 'worker crashed' } });
    expect(getByText('activation error: worker crashed', { exact: false })).toBeTruthy();
  });

  it('«＋ Install» calls onInstall', async () => {
    const onInstall = vi.fn();
    const { getByText } = render(ExtensionsScreen, { props: { ...base, plugins: [], onInstall } });
    await fireEvent.click(getByText('＋ Install'));
    expect(onInstall).toHaveBeenCalled();
  });

  it('trash 🗑 calls onUninstall(info)', async () => {
    const onUninstall = vi.fn();
    const { container } = render(ExtensionsScreen, { props: { ...base, plugins: [demo], onUninstall } });
    await fireEvent.click(container.querySelector('.trash')!);
    expect(onUninstall).toHaveBeenCalledWith(demo);
  });

  it('trash is visible even for a broken plugin', () => {
    const { container } = render(ExtensionsScreen, { props: { ...base, plugins: [broken] } });
    expect(container.querySelector('.trash')).toBeTruthy();
  });

  it('busyId blocks the trash', () => {
    const { container } = render(ExtensionsScreen, { props: { ...base, plugins: [demo], busyId: 'dev.term.demo' } });
    expect((container.querySelector('.trash') as HTMLButtonElement).disabled).toBe(true);
  });

  it('clicking a row calls onOpenDetail(id)', async () => {
    const onOpenDetail = vi.fn();
    const { container } = render(ExtensionsScreen, { props: { ...base, plugins: [demo], onOpenDetail } });
    await fireEvent.click(container.querySelector('.row-open')!);
    expect(onOpenDetail).toHaveBeenCalledWith('dev.term.demo');
  });

  it('clicking the toggle does NOT open details', async () => {
    const onOpenDetail = vi.fn();
    const onToggle = vi.fn();
    const { container } = render(ExtensionsScreen, { props: { ...base, plugins: [demo], onOpenDetail, onToggle } });
    await fireEvent.click(container.querySelector('.toggle')!);
    expect(onToggle).toHaveBeenCalled();
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it('empty list → placeholder; refresh/close — icons, call callbacks', async () => {
    const onRefresh = vi.fn(); const onClose = vi.fn();
    const { getByText, getByLabelText } = render(ExtensionsScreen, { props: { ...base, plugins: [], onRefresh, onClose } });
    expect(getByText('No extensions', { exact: false })).toBeTruthy();
    await fireEvent.click(getByLabelText('refresh'));
    await fireEvent.click(getByLabelText('close'));
    expect(onRefresh).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('Install — filled button with text ＋ Install', () => {
    const { getByText, container } = render(ExtensionsScreen, { props: { ...base, plugins: [] } });
    expect(getByText('＋ Install')).toBeTruthy();
    expect(container.querySelector('.install')).toBeTruthy();
  });

  it('icon plate: tinted background by accent, broken → ⚠', () => {
    const r1 = render(ExtensionsScreen, { props: { ...base, plugins: [git] } });
    const ico = r1.container.querySelector('.ico') as HTMLElement;
    expect(ico).toBeTruthy();
    expect(ico.getAttribute('style')).toMatch(/color-mix|rgba|#/); // tinted background is present
    cleanup();
    const r2 = render(ExtensionsScreen, { props: { ...base, plugins: [broken] } });
    expect(r2.container.querySelector('.ico')!.textContent).toContain('⚠');
  });

  it('status = dot + word in the meta (enabled)', () => {
    const { getByText, container } = render(ExtensionsScreen, { props: { ...base, plugins: [git] } });
    expect(getByText('enabled')).toBeTruthy();
    expect(container.querySelector('.row .dot')).toBeTruthy(); // status marker dot
    expect(container.querySelector('.row > .status')).toBeNull(); // right pill removed
  });

  it('disabled → dot + word', () => {
    const { getByText, container } = render(ExtensionsScreen, { props: { ...base, plugins: [demo] } });
    expect(getByText('disabled')).toBeTruthy();
    expect(container.querySelector('.row .dot')).toBeTruthy();
  });

  it('toggle: ON class is present on the enabled one', () => {
    const { container } = render(ExtensionsScreen, { props: { ...base, plugins: [git] } });
    expect(container.querySelector('.toggle.on')).toBeTruthy();
  });

  // S8.5 — grouping: enabled → divider DISABLED → disabled → broken at the end
  it('grouping: enabled before disabled, DISABLED divider visible', () => {
    const { container, getByText } = render(ExtensionsScreen, { props: { ...base, plugins: [git, demo] } });
    const rows = container.querySelectorAll('.row');
    expect(rows[0].textContent).toContain('Git');   // enabled first
    expect(rows[1].textContent).toContain('Demo');  // disabled second
    expect(getByText('DISABLED')).toBeTruthy();
  });

  it('divider is hidden if all are enabled', () => {
    const enDemo = { ...demo, enabled: true };
    const { queryByText } = render(ExtensionsScreen, { props: { ...base, plugins: [git, enDemo] } });
    expect(queryByText('DISABLED')).toBeNull();
  });

  it('disabled plugin: disabled-row class', () => {
    const { container } = render(ExtensionsScreen, { props: { ...base, plugins: [demo] } });
    expect(container.querySelector('.row.disabled-row')).toBeTruthy();
  });

  it('broken — at the end of the list, error inline in the meta', () => {
    const { container, getByText } = render(ExtensionsScreen, { props: { ...base, plugins: [broken, git] } });
    const rows = container.querySelectorAll('.row');
    expect(rows[rows.length - 1].textContent).toContain('error'); // broken last
    expect(getByText('error:', { exact: false })).toBeTruthy();
  });

  // S8.6 — filter row
  it('filter: input leaves only matches, counter reflects the number', async () => {
    const { getByLabelText, getByText, queryByText, container } = render(ExtensionsScreen, { props: { ...base, plugins: [git, demo] } });
    const input = getByLabelText('filter extensions') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'git' } });
    expect(getByText('Git')).toBeTruthy();
    expect(queryByText('Demo')).toBeNull();
    expect(container.querySelectorAll('.row').length).toBe(1);
  });

  it('no matches → No matching placeholder', async () => {
    const { getByLabelText, getByText } = render(ExtensionsScreen, { props: { ...base, plugins: [git] } });
    await fireEvent.input(getByLabelText('filter extensions'), { target: { value: 'zzz' } });
    expect(getByText('No matching extensions', { exact: false })).toBeTruthy();
  });

  it('empty query → all rows visible', () => {
    const { container } = render(ExtensionsScreen, { props: { ...base, plugins: [git, demo] } });
    expect(container.querySelectorAll('.row').length).toBe(2);
  });

  // S8.7 — footer: installed/enabled summary + plugins folder link
  it('footer: «N installed · M enabled», enabled excludes broken', () => {
    const enDemo = { ...demo, enabled: true };
    const { getByText } = render(ExtensionsScreen, { props: { ...base, plugins: [git, enDemo, broken] } });
    // git+enDemo enabled (2), broken.enabled=false → not counted; installed=3
    expect(getByText('3 installed · 2 enabled', { exact: false })).toBeTruthy();
  });

  it('plugins folder: link present, click calls onOpenFolder if provided', async () => {
    const onOpenFolder = vi.fn();
    const { getByLabelText } = render(ExtensionsScreen, { props: { ...base, plugins: [git], onOpenFolder } });
    const link = getByLabelText('open plugins folder');
    await fireEvent.click(link);
    expect(onOpenFolder).toHaveBeenCalled();
  });

  it('plugins folder: link disabled if onOpenFolder is not provided', () => {
    const { getByLabelText } = render(ExtensionsScreen, { props: { ...base, plugins: [git] } });
    const link = getByLabelText('open plugins folder') as HTMLButtonElement;
    expect(link.disabled).toBe(true);
  });
});
