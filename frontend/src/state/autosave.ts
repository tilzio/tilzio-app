// Trailing-edge debounce with manual flush, used to coalesce layout autosaves
// (~500ms) and to force a final save on app exit. Kept Svelte-free so it is
// unit-testable with fake timers.
export function debounce(
  fn: () => void,
  ms: number,
): { schedule(): void; flush(): void; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        fn();
      }, ms);
    },
    flush() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
        fn();
      }
    },
    cancel() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
