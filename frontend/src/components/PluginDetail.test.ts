// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import PluginDetail from './PluginDetail.svelte';
import type { PluginInfo } from '../bridge/plugins';

afterEach(cleanup);

const git: PluginInfo = {
  dir: 'ts-git', enabled: true, permissions: [], err: '',
  manifest: {
    id: 'dev.term.git', name: 'GitTool', version: '1.2.0', engine: 'tilzio@1', entry: 'main.js',
    permissions: ['exec', 'state:read'], exec: ['git'],
    contributes: { activityBar: [{ id: 'g', icon: 'G', title: 'Git icon', opens: 'gp' }], panels: [{ id: 'gp', location: 'right', title: 'Git panel' }] },
  },
};
const broken: PluginInfo = { dir: 'bad', enabled: false, permissions: [], err: 'manifest: field id is missing', manifest: null };
const base = { storage: null, runtimeError: null, busy: false, onToggle: vi.fn(), onUninstall: vi.fn(), onReset: vi.fn(), onBack: vi.fn() };

describe('PluginDetail', () => {
  it('renders name, version, path', () => {
    const { container } = render(PluginDetail, { props: { ...base, info: git } });
    expect(container.textContent).toContain('GitTool');
    expect(container.textContent).toContain('1.2.0');
    expect(container.textContent).toContain('ts-git');
  });

  it('renders permissions human-readably', () => {
    const { container } = render(PluginDetail, { props: { ...base, info: git } });
    expect(container.textContent).toContain('Run commands');
    expect(container.textContent).toContain('Read layout');
  });

  it('renders contributions (what it adds to the interface)', () => {
    const { container } = render(PluginDetail, { props: { ...base, info: git } });
    expect(container.textContent).toContain('Activity Bar');
    expect(container.textContent).toContain('Git panel');
  });

  it('storage: object → keys/bytes; null → placeholder, does not crash', async () => {
    const { container, rerender } = render(PluginDetail, { props: { ...base, info: git, storage: { keys: 2, bytes: 64 } } });
    expect(container.textContent).toContain('2 keys');
    expect(container.textContent).toContain('64 bytes');
    await rerender({ ...base, info: git, storage: null });
    expect(container.textContent).toContain('kept when deleted');
  });

  it('the back/toggle/uninstall buttons call callbacks', async () => {
    const onBack = vi.fn(); const onToggle = vi.fn(); const onUninstall = vi.fn();
    const { container } = render(PluginDetail, { props: { ...base, info: git, onBack, onToggle, onUninstall } });
    await fireEvent.click(container.querySelector('.back')!);
    expect(onBack).toHaveBeenCalled();
    await fireEvent.click(container.querySelector('.toggle')!);
    expect(onToggle).toHaveBeenCalledWith(false); // git.enabled=true → !enabled=false
    await fireEvent.click(container.querySelector('.trash')!);
    expect(onUninstall).toHaveBeenCalled();
  });

  it('broken plugin: error + path + trash, toggle disabled', () => {
    const { container } = render(PluginDetail, { props: { ...base, info: broken } });
    expect(container.textContent).toContain('manifest: field id is missing');
    expect(container.textContent).toContain('bad');
    expect(container.querySelector('.trash')).toBeTruthy();
    expect((container.querySelector('.toggle') as HTMLButtonElement).disabled).toBe(true);
  });

  it('the «Reset to defaults» button renders and calls onReset', async () => {
    const onReset = vi.fn();
    const { container, getByText } = render(PluginDetail, { props: { ...base, info: git, onReset } });
    expect(container.querySelector('.reset')).toBeTruthy();
    await fireEvent.click(getByText('↺ Reset to defaults'));
    expect(onReset).toHaveBeenCalled();
  });

  it('the «Reset» button is hidden for a broken plugin (no DATA section)', () => {
    const { container } = render(PluginDetail, { props: { ...base, info: broken } });
    expect(container.querySelector('.reset')).toBeNull();
  });

  it('the «Reset» button is disabled when busy', () => {
    const { container } = render(PluginDetail, { props: { ...base, info: git, busy: true } });
    expect((container.querySelector('.reset') as HTMLButtonElement).disabled).toBe(true);
  });

  it('identity: icon badge + name + version in the header', () => {
    const { container, getByText } = render(PluginDetail, { props: { ...base, info: git } });
    expect(container.querySelector('.identity .ico')).toBeTruthy();
    expect(getByText('GitTool')).toBeTruthy();
    expect(container.textContent).toContain('v1.2.0');
  });

  it('status (dot + text enabled) on the plugin name row', () => {
    const { getByText, container } = render(PluginDetail, { props: { ...base, info: git } });
    expect(getByText('enabled')).toBeTruthy();
    // actions (status/toggle/trash) moved into the name row (identity), not into .head
    expect(container.querySelector('.identity .dot')).toBeTruthy();
    expect(container.querySelector('.head .dot')).toBeNull();
  });

  // S8.9 — section rhythm, CONTRIBUTES marker dots, DATA, Reset radius
  it('CONTRIBUTES: « — » format and a marker dot', () => {
    const { container, getByText } = render(PluginDetail, { props: { ...base, info: git } });
    expect(getByText('Activity Bar — ', { exact: false })).toBeTruthy(); // dash, not a colon
    expect(container.querySelector('.contrib .dot')).toBeTruthy();        // marker dot
  });

  it('caps section titles UPPERCASE', () => {
    const { getByText } = render(PluginDetail, { props: { ...base, info: git } });
    expect(getByText('PERMISSIONS')).toBeTruthy();
    expect(getByText('CONTRIBUTES TO UI')).toBeTruthy();
    expect(getByText('DATA')).toBeTruthy();
    expect(getByText('PATH')).toBeTruthy();
  });

  it('statusBar → «1 item» (without «(s)»)', () => {
    const withSb: PluginInfo = { ...git, manifest: { ...git.manifest!, contributes: { statusBar: [{ id: 's' }] } } };
    const { getByText } = render(PluginDetail, { props: { ...base, info: withSb } });
    expect(getByText('1 item', { exact: false })).toBeTruthy();
  });

  it('statusBar → «2 items» for two (without «(s)»)', () => {
    const withSb2: PluginInfo = { ...git, manifest: { ...git.manifest!, contributes: { statusBar: [{ id: 's1' }, { id: 's2' }] } } };
    const { getByText } = render(PluginDetail, { props: { ...base, info: withSb2 } });
    expect(getByText('2 items', { exact: false })).toBeTruthy();
  });
});
