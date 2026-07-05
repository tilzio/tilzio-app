import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the generated bindings module — there is no Wails runtime in node/jsdom.
vi.mock('../../bindings/github.com/tilzio/tilzio/filesapp', () => ({
  ReadFile: vi.fn(),
  WriteFile: vi.fn(),
  StatFile: vi.fn(),
  SaveDraft: vi.fn(),
  LoadDraft: vi.fn(),
  ClearDraft: vi.fn(),
  ListDrafts: vi.fn(),
}));

vi.mock('@wailsio/runtime', () => ({
  Dialogs: { OpenFile: vi.fn() },
}));

import * as bindings from '../../bindings/github.com/tilzio/tilzio/filesapp';
import { Dialogs } from '@wailsio/runtime';
import { files } from './files';

beforeEach(() => vi.clearAllMocks());

describe('files bridge', () => {
  it('readFile delegates to ReadFile and returns content', async () => {
    (bindings.ReadFile as any).mockResolvedValue('hello');
    const out = await files.readFile('/a.ts');
    expect(bindings.ReadFile).toHaveBeenCalledWith('/a.ts');
    expect(out).toBe('hello');
  });

  it('writeFile delegates to WriteFile', async () => {
    (bindings.WriteFile as any).mockResolvedValue(undefined);
    await files.writeFile('/a.ts', 'body');
    expect(bindings.WriteFile).toHaveBeenCalledWith('/a.ts', 'body');
  });

  it('statFile returns the {exists,isDir} shape', async () => {
    (bindings.StatFile as any).mockResolvedValue({ exists: true, isDir: false });
    const s = await files.statFile('/a.ts');
    expect(s).toEqual({ exists: true, isDir: false });
  });

  it('saveDraft / loadDraft / clearDraft delegate with paneId', async () => {
    (bindings.LoadDraft as any).mockResolvedValue({ found: true, path: '/a', content: 'x' });
    await files.saveDraft('pane-1', '/a', 'x');
    expect(bindings.SaveDraft).toHaveBeenCalledWith('pane-1', '/a', 'x');
    const d = await files.loadDraft('pane-1');
    expect(d).toEqual({ found: true, path: '/a', content: 'x' });
    await files.clearDraft('pane-1');
    expect(bindings.ClearDraft).toHaveBeenCalledWith('pane-1');
  });

  it('readFile propagates rejection (oversized/binary → Go error)', async () => {
    (bindings.ReadFile as any).mockRejectedValue(new Error('file too large'));
    await expect(files.readFile('/big')).rejects.toThrow('file too large');
  });
});

describe('files.openFileDialog', () => {
  it('openFileDialog returns the chosen path', async () => {
    (Dialogs.OpenFile as any).mockResolvedValueOnce('/Users/me/a.ts');
    expect(await files.openFileDialog()).toBe('/Users/me/a.ts');
  });
  it('openFileDialog returns null when the dialog is cancelled (empty string)', async () => {
    (Dialogs.OpenFile as any).mockResolvedValueOnce('');
    expect(await files.openFileDialog()).toBeNull();
  });
});
