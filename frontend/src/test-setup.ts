// jsdom does not implement DragEvent, so fireEvent.drop/dragover cannot forward
// clientX/clientY from EventInit. Polyfilling DragEvent as MouseEvent fixes this:
// @testing-library creates `new DragEvent(type, init)` which then goes through the
// MouseEvent constructor that DOES read clientX/clientY from EventInit.
if (typeof window !== 'undefined' && typeof (window as any).DragEvent === 'undefined') {
  (window as any).DragEvent = MouseEvent;
}

// jsdom does not implement PointerEvent — @testing-library will not forward clientX from
// EventInit (the same trick as with DragEvent above). MouseEvent reads clientX.
if (typeof window !== 'undefined' && typeof (window as any).PointerEvent === 'undefined') {
  (window as any).PointerEvent = MouseEvent;
}
// jsdom elements lack pointer-capture methods — no-op stubs.
if (typeof Element !== 'undefined') {
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
}

// jsdom has no ResizeObserver — EditorPane.onMount uses it (gate for split buttons).
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
