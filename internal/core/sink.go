package core

// OutputSink receives terminal output and lifecycle events from the core.
// The Wails app provides an event-emitting implementation (Plan 2); tests
// provide a fake. Injecting this is what keeps the core daemon-ready.
//
// Implementations must be safe for concurrent calls from multiple goroutines
// (one read-loop goroutine per active pane may call into the sink at once).
type OutputSink interface {
	// Output delivers a chunk of bytes produced by the pane's shell.
	Output(id PaneID, chunk []byte)
	// Exited reports that the pane's shell terminated with the given code.
	Exited(id PaneID, code int)
}
