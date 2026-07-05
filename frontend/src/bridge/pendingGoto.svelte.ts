// Transient "where to jump" by fileId (Stage C). Reactive ($state) so the live
// EditorFileBody consumes it in an $effect. NOT serialized (line/col are transient —
// we don't touch serialize.ts). Mirror of editorDirty.svelte.ts.
export interface GotoTarget {
  line: number;
  col?: number;
}

const targets = $state<Record<string, GotoTarget>>({});

export const pendingGoto = {
  get(fileId: string): GotoTarget | undefined {
    return targets[fileId];
  },
  set(fileId: string, target: GotoTarget): void {
    targets[fileId] = target;
  },
  consume(fileId: string): void {
    delete targets[fileId];
  },
};

// Test seam: clear module state between unit tests.
export function __resetForTests(): void {
  for (const k of Object.keys(targets)) delete targets[k];
}
