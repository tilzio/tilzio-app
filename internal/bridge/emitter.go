package bridge

// Emitter delivers a named event with a JSON-serializable payload to the
// frontend. The Wails adapter (package main) wraps application.Get().Event;
// tests use a fake. Keeping the bridge behind this interface makes it testable
// without the Wails runtime and keeps the core daemon-ready (spec §4).
type Emitter interface {
	Emit(name string, data any)
}
