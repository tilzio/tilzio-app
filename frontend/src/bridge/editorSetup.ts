import { EditorState, Compartment, type Extension, type Text } from '@codemirror/state';
import {
  EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, keymap,
} from '@codemirror/view';
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching,
  LanguageDescription,
} from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { tags as t } from '@lezer/highlight';

// gruvbox-warm highlighting (palette — styles/theme.css + mockup editor-final).
const gruvbox = HighlightStyle.define([
  { tag: t.comment, color: '#928374', fontStyle: 'italic' },
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword], color: '#d3869b' },
  { tag: [t.string, t.special(t.string)], color: '#b8bb26' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#8ec07c' },
  { tag: [t.typeName, t.className, t.namespace], color: '#fabd2f' },
  { tag: [t.number, t.bool, t.atom], color: '#d3869b' },
  { tag: [t.propertyName, t.attributeName], color: '#83a598' },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: '#bdae93' },
  { tag: [t.heading], color: '#fabd2f', fontWeight: 'bold' },
  { tag: [t.emphasis], fontStyle: 'italic', color: '#d3869b' },
  { tag: [t.strong], fontWeight: 'bold' },
  { tag: [t.link, t.url], color: '#83a598', textDecoration: 'underline' },
  { tag: [t.list, t.quote], color: '#b8bb26' },
  { tag: t.invalid, color: '#fb4934' },
]);

// Editor chrome for gruvbox-warm. Full visual check happens at smoke.
const gruvboxTheme = EditorView.theme(
  {
    '&': { color: '#d5c4a1', backgroundColor: '#282828', height: '100%' },
    '.cm-content': { caretColor: '#fe8019', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 'var(--editor-font-size, 13px)' },
    '.cm-scroller': { fontFamily: 'ui-monospace, Menlo, monospace', lineHeight: '1.5', fontSize: 'var(--editor-font-size, 13px)' },
    '&.cm-focused .cm-cursor': { borderLeftColor: '#fe8019' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: '#504945',
    },
    '.cm-gutters': { backgroundColor: '#262423', color: '#5a5450', border: 'none' },
    '.cm-activeLineGutter': { backgroundColor: '#32302f', color: '#fabd2f' },
    '.cm-activeLine': { backgroundColor: '#ffffff08' },
  },
  { dark: true },
);

// Dropping a FILE from Finder into the editor area must NOT insert its content: by
// default CM6 reads dataTransfer.files via FileReader and inserts the text into the document.
// We suppress ONLY the external file-drop (preventDefault + return true → the built-in CM6 drop is
// not executed), so that only the native Wails WindowFilesDropped fires and the file OPENS
// (like a drop into the header/split). An internal drag-move-selection (no files) returns false,
// CM6 handles it as usual. Pure — tested against a mock event.
export function suppressFileDrop(event: DragEvent): boolean {
  if (event.dataTransfer?.files?.length) {
    event.preventDefault();
    return true;
  }
  return false;
}

export function suppressFileDragover(event: DragEvent): boolean {
  if (event.dataTransfer?.types?.includes('Files')) {
    event.preventDefault();
    return true;
  }
  return false;
}

// Base set of source-mode extensions (without the language — it is loaded lazily).
function baseExtensions(onChange: (doc: string) => void): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    drawSelection(),
    history(),
    indentOnInput(),
    bracketMatching(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    syntaxHighlighting(gruvbox),
    gruvboxTheme,
    // Suppress the external file-drop from Finder in the editor (see suppressFileDrop below).
    EditorView.domEventHandlers({
      drop: (event) => suppressFileDrop(event),
      dragover: (event) => suppressFileDragover(event),
    }),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) onChange(u.state.doc.toString());
    }),
  ];
}

// Pure (DOM-free) — testable in node. Language is added later via the compartment.
const languageCompartment = new Compartment();

export interface EditorStateOpts {
  doc: string;
  onChange: (doc: string) => void;
}

export function createEditorState(opts: EditorStateOpts): EditorState {
  return EditorState.create({
    doc: opts.doc,
    extensions: [languageCompartment.of([]), ...baseExtensions(opts.onChange)],
  });
}

// Sync, pure — pick a CM6 language by filename (null = unknown / no path / welcome).
export function pickLanguage(path?: string): LanguageDescription | null {
  if (!path) return null;
  return LanguageDescription.matchFilename(languages, path) ?? null;
}

// Async — resolve the language Extension for a path. .md gets markdownLanguage with
// fenced-code highlighting via language-data; other files lazy-load their language.
export async function loadLanguage(path?: string): Promise<Extension | null> {
  if (path && /\.(md|markdown)$/i.test(path)) {
    return markdown({ base: markdownLanguage, codeLanguages: languages });
  }
  const desc = pickLanguage(path);
  if (!desc) return null;
  try {
    return await desc.load();
  } catch {
    return null;
  }
}

// Converts 1-based line/col into a CM6 document offset, clamping to bounds (compiler/grep
// output is 1-based). col defaults to 1. Pure — testable on Text.
export function lineColToOffset(doc: Text, line: number, col = 1): number {
  const n = Math.max(1, Math.min(line, doc.lines));
  const l = doc.line(n);
  return Math.min(l.from + Math.max(0, col - 1), l.to);
}

// Seam over EditorView — EditorPane uses ONLY this interface, never CM6 internals,
// so the component is testable with editorSetup mocked. The real EditorView render
// (CM6-in-WKWebView) is verified at GUI smoke.
export interface EditorHandle {
  getDoc(): string;
  getCursor(): number;
  focus(): void;
  gotoLine(line: number, col?: number): void;
  destroy(): void;
}

export interface MountOpts {
  doc: string;
  path?: string;
  cursor?: number;
  onChange: (doc: string) => void;
}

export function mountEditor(parent: HTMLElement, opts: MountOpts): EditorHandle {
  const state = createEditorState({ doc: opts.doc, onChange: opts.onChange });
  const view = new EditorView({ state, parent });
  if (opts.cursor != null) {
    const pos = Math.min(opts.cursor, view.state.doc.length);
    view.dispatch({ selection: { anchor: pos } });
  }
  // Lazy language load → reconfigure once ready. CM6 ignores dispatch on a
  // destroyed view (updates internal state but does not re-render), so this is
  // safe even if the component unmounts before the language bundle resolves.
  void loadLanguage(opts.path).then((ext) => {
    if (ext) view.dispatch({ effects: languageCompartment.reconfigure(ext) });
  });
  return {
    getDoc: () => view.state.doc.toString(),
    getCursor: () => view.state.selection.main.head,
    focus: () => view.focus(),
    gotoLine: (line: number, col?: number) => {
      const pos = lineColToOffset(view.state.doc, line, col);
      view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: 'center' }),
      });
      view.focus();
    },
    destroy: () => view.destroy(),
  };
}
