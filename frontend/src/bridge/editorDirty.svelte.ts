// Reactive source of truth for the "dirty" ● indicator on tab chips.
// editorBuffers (plain Map) stores the buffer CONTENT for mount-without-kill, but the ● dot
// must light up/turn off live on edit/save — and $derived does not track
// mutations of a plain Map. So dirty lives here, in module-level $state (mirror of
// singletons store/dragState/alerts). The key is a per-file fileId (one tab).
const flags = $state<Record<string, boolean>>({});

export const editorDirty = {
  get(fileId: string): boolean {
    return flags[fileId] ?? false;
  },
  set(fileId: string, value: boolean): void {
    flags[fileId] = value;
  },
  delete(fileId: string): void {
    delete flags[fileId];
  },
};

// Test seam: clear module state between unit tests.
export function __resetForTests(): void {
  for (const k of Object.keys(flags)) delete flags[k];
}
