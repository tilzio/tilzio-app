// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import StoreCard from './StoreCard.svelte';
import type { StoreEntry, StoreDetail } from '../bridge/plugins';

afterEach(cleanup);

const entry: StoreEntry = {
  id: 'io.tilzio.ai-limits', name: 'AI Limits', description: 'usage gauges',
  version: '1.2.0', engine: 'tilzio@1', permissions: ['exec'], exec: ['claude'],
  size: 3, sha256: 'aa', publisher: 'tilzio', homepage: 'https://tilzio.example',
  updatedAt: '2026-07-14T00:00:00Z',
};
const detail: StoreDetail = { ...entry, readme: '# Hello\n\n<script>alert(1)<\/script>\n\n*world*', versions: [] };

const base = {
  entry, detail, detailError: '', installedVersion: '', update: undefined,
  busy: false, error: '',
  onInstall: vi.fn(), onUpdate: vi.fn(), onUninstall: vi.fn(), onBack: vi.fn(),
};

describe('StoreCard', () => {
  it('renders identity: name, version+id, publisher', () => {
    const { getByText } = render(StoreCard, { props: { ...base } });
    expect(getByText('AI Limits')).toBeTruthy();
    expect(getByText(/v1\.2\.0 · io\.tilzio\.ai-limits/)).toBeTruthy();
    expect(getByText('tilzio')).toBeTruthy();
  });

  it('renders sanitized README (markdown in, no script out)', () => {
    const { container } = render(StoreCard, { props: { ...base } });
    const readme = container.querySelector('.readme')!;
    expect(readme.querySelector('h1')?.textContent).toBe('Hello');
    expect(readme.querySelector('em')?.textContent).toBe('world');
    expect(readme.querySelector('script')).toBeNull();
  });

  it('renders permission chips', () => {
    const { getByText } = render(StoreCard, { props: { ...base } });
    expect(getByText(/Run commands/)).toBeTruthy(); // perm.exec.title in en.json
  });

  it('not installed → Install button fires onInstall', async () => {
    const onInstall = vi.fn();
    const { container } = render(StoreCard, { props: { ...base, onInstall } });
    await fireEvent.click(container.querySelector('.inst')!);
    expect(onInstall).toHaveBeenCalled();
  });

  it('installed + update → Update and Uninstall buttons', async () => {
    const onUpdate = vi.fn(); const onUninstall = vi.fn();
    const { container } = render(StoreCard, {
      props: {
        ...base, installedVersion: '1.0.0', onUpdate, onUninstall,
        update: { id: entry.id, from: '1.0.0', to: '1.2.0', permsChanged: true },
      },
    });
    expect(container.querySelector('.inst')).toBeNull();
    await fireEvent.click(container.querySelector('.upd')!);
    expect(onUpdate).toHaveBeenCalled();
    await fireEvent.click(container.querySelector('.trash')!);
    expect(onUninstall).toHaveBeenCalled();
  });

  it('installed current version → only Uninstall, no Install/Update', () => {
    const { container } = render(StoreCard, { props: { ...base, installedVersion: '1.2.0' } });
    expect(container.querySelector('.inst')).toBeNull();
    expect(container.querySelector('.upd')).toBeNull();
    expect(container.querySelector('.trash')).toBeTruthy();
  });

  it('busy disables buttons; error is shown; detailError shows readme note', () => {
    const { container, getByText } = render(StoreCard, {
      props: { ...base, detail: null, detailError: 'net down', busy: true, error: 'sha mismatch' },
    });
    expect((container.querySelector('.inst') as HTMLButtonElement).disabled).toBe(true);
    expect(getByText('sha mismatch')).toBeTruthy();
    expect(getByText(/README unavailable/)).toBeTruthy();
  });

  it('back button fires onBack', async () => {
    const onBack = vi.fn();
    const { container } = render(StoreCard, { props: { ...base, onBack } });
    await fireEvent.click(container.querySelector('.back')!);
    expect(onBack).toHaveBeenCalled();
  });

  it('autofocuses the back button on render', () => {
    const { container } = render(StoreCard, { props: { ...base } });
    const back = container.querySelector('.back') as HTMLButtonElement;
    expect(document.activeElement).toBe(back);
  });
});
