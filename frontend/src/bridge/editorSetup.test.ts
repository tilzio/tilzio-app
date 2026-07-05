import { describe, it, expect, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import {
  createEditorState, pickLanguage, loadLanguage, lineColToOffset,
  suppressFileDrop, suppressFileDragover,
} from './editorSetup';

describe('createEditorState', () => {
  it('holds the given doc text', () => {
    const st = createEditorState({ doc: 'line1\nline2', onChange: () => {} });
    expect(st.doc.toString()).toBe('line1\nline2');
  });

  it('produces a multi-line document with correct line count', () => {
    const st = createEditorState({ doc: 'a\nb\nc', onChange: () => {} });
    expect(st.doc.lines).toBe(3);
  });

  it('does not call onChange during initial state creation', () => {
    const calls: string[] = [];
    createEditorState({ doc: 'hello', onChange: (d) => calls.push(d) });
    expect(calls).toHaveLength(0);
  });
});

describe('pickLanguage', () => {
  it('matches a TypeScript file by extension', () => {
    expect(pickLanguage('/x/files.ts')?.name).toBe('TypeScript');
  });

  it('matches a Go file', () => {
    expect(pickLanguage('main.go')?.name).toBe('Go');
  });

  it('matches markdown', () => {
    expect(pickLanguage('README.md')?.name).toBe('Markdown');
  });

  it('returns null for unknown extension', () => {
    expect(pickLanguage('blob.zzzznope')).toBeNull();
  });

  it('returns null when no path (welcome)', () => {
    expect(pickLanguage(undefined)).toBeNull();
  });
});

describe('loadLanguage', () => {
  it('resolves null for unknown extension', async () => {
    expect(await loadLanguage('file.zzzznope')).toBeNull();
  });

  it('resolves null when no path', async () => {
    expect(await loadLanguage(undefined)).toBeNull();
  });

  it('resolves an Extension for markdown', async () => {
    const ext = await loadLanguage('README.md');
    expect(ext).not.toBeNull();
  });
});

describe('lineColToOffset', () => {
  const doc = EditorState.create({ doc: 'aaa\nbbbb\ncc' }).doc; // lines 1..3

  it('maps line 1 col 1 to offset 0', () => {
    expect(lineColToOffset(doc, 1, 1)).toBe(0);
  });
  it('maps line 2 col 1 to the start of the second line', () => {
    expect(lineColToOffset(doc, 2, 1)).toBe(4); // 'aaa\n' = 4
  });
  it('applies col within a line', () => {
    expect(lineColToOffset(doc, 2, 3)).toBe(6); // 4 + (3-1)
  });
  it('defaults col to 1 when omitted', () => {
    expect(lineColToOffset(doc, 3)).toBe(9); // 'aaa\nbbbb\n' = 9
  });
  it('clamps a line past the end to the last line', () => {
    expect(lineColToOffset(doc, 999, 1)).toBe(9); // line 3 .from
  });
  it('clamps line below 1 to line 1', () => {
    expect(lineColToOffset(doc, 0, 1)).toBe(0);
  });
  it('clamps col past line end to the line end', () => {
    expect(lineColToOffset(doc, 1, 99)).toBe(3); // end of 'aaa'
  });
});

describe('suppressFileDrop / suppressFileDragover', () => {
  it('suppresses an external file drop (prevents CM6 from inserting file content)', () => {
    const preventDefault = vi.fn();
    const event = { preventDefault, dataTransfer: { files: [{ name: 'a.ts' }] } } as unknown as DragEvent;
    expect(suppressFileDrop(event)).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
  });
  it('does NOT suppress an internal text drag (no files → CM6 drag-move-selection works)', () => {
    const preventDefault = vi.fn();
    const event = { preventDefault, dataTransfer: { files: [] } } as unknown as DragEvent;
    expect(suppressFileDrop(event)).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });
  it('handles a drop with no dataTransfer', () => {
    const preventDefault = vi.fn();
    const event = { preventDefault, dataTransfer: null } as unknown as DragEvent;
    expect(suppressFileDrop(event)).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });
  it('suppresses dragover when the payload is Files', () => {
    const preventDefault = vi.fn();
    const event = { preventDefault, dataTransfer: { types: ['Files'] } } as unknown as DragEvent;
    expect(suppressFileDragover(event)).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
  });
  it('does NOT suppress dragover for a text payload', () => {
    const preventDefault = vi.fn();
    const event = { preventDefault, dataTransfer: { types: ['text/plain'] } } as unknown as DragEvent;
    expect(suppressFileDragover(event)).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
