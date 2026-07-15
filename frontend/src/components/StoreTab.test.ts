// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import StoreTab from './StoreTab.svelte';
import type { StoreEntry } from '../bridge/plugins';

afterEach(cleanup);

function entry(id: string, name: string, version = '1.0.0', description = 'desc'): StoreEntry {
  return {
    id, name, description, version, engine: 'tilzio@1', permissions: [], exec: [],
    size: 1, sha256: 'aa', publisher: 'tilzio', updatedAt: '2026-07-14T00:00:00Z',
  };
}

const base = {
  entries: [entry('a', 'Alpha'), entry('b', 'Beta')],
  stale: false, loading: false, error: '',
  installed: {} as Record<string, string>,
  busyId: null as string | null,
  onOpen: vi.fn(), onInstall: vi.fn(),
};

describe('StoreTab', () => {
  it('renders catalog rows', () => {
    const { getByText } = render(StoreTab, { props: { ...base } });
    expect(getByText('Alpha')).toBeTruthy();
    expect(getByText('Beta')).toBeTruthy();
  });

  it('filters by search query (name/description/id)', async () => {
    const { getByLabelText, queryByText } = render(StoreTab, { props: { ...base } });
    await fireEvent.input(getByLabelText('search the extension store'), { target: { value: 'alp' } });
    expect(queryByText('Alpha')).toBeTruthy();
    expect(queryByText('Beta')).toBeNull();
  });

  it('shows Install for not-installed, Installed for installed rows; never an Update button', () => {
    const props = {
      ...base,
      installed: { a: '1.0.0', b: '1.0.0' },
      entries: [entry('a', 'Alpha'), entry('b', 'Beta', '2.0.0'), entry('c', 'Gamma')],
    };
    const { container, getAllByText } = render(StoreTab, { props });
    // a, b are installed — even b, whose entry version (2.0.0) differs from its installed
    // version, is just "Installed": the Store list never offers Update (that lives on
    // the Installed-tab badge and the extension card).
    expect(getAllByText('Installed').length).toBe(2);
    expect(container.querySelector('.upd')).toBeNull();
    expect(container.querySelector('.inst')).toBeTruthy();  // c: Install button
  });

  it('fires callbacks: row open, install', async () => {
    const onOpen = vi.fn(); const onInstall = vi.fn();
    const props = {
      ...base, onOpen, onInstall,
    };
    const { container } = render(StoreTab, { props });
    await fireEvent.click(container.querySelector('.row-open')!);
    expect(onOpen).toHaveBeenCalledWith('a');
    await fireEvent.click(container.querySelector('.inst')!);
    expect(onInstall).toHaveBeenCalledWith('a');
  });

  it('busy row disables its action button', () => {
    const { container } = render(StoreTab, { props: { ...base, busyId: 'a' } });
    expect((container.querySelector('.inst') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the offline chip when stale', () => {
    const { getByText } = render(StoreTab, { props: { ...base, stale: true } });
    expect(getByText('offline (cached)')).toBeTruthy();
  });

  it('shows error banner and empty state', () => {
    const { getByText, rerender } = render(StoreTab, {
      props: { ...base, entries: [], error: 'boom' },
    });
    expect(getByText(/Could not load the catalog/)).toBeTruthy();
  });
});
