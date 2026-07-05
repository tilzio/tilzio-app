package bridge

import (
	"encoding/base64"

	"github.com/tilzio/tilzio/internal/core"
)

// Event names emitted to the frontend.
const (
	EventOutput = "pty:output"
	EventExited = "pty:exited"
	EventBell   = "pty:bell"
)

// OutputPayload is the pty:output event body. Chunk is base64-encoded raw PTY
// bytes (robust for binary/TUI output and multibyte runes split across reads).
type OutputPayload struct {
	ID    string `json:"id"`
	Chunk string `json:"chunk"`
}

// ExitedPayload is the pty:exited event body.
type ExitedPayload struct {
	ID   string `json:"id"`
	Code int    `json:"code"`
}

// BellPayload is the pty:bell event body. Count is the number of real BEL bells
// in one output chunk (excludes OSC/string-sequence terminators).
type BellPayload struct {
	ID    string `json:"id"`
	Count int    `json:"count"`
}

// countBells counts real BEL bytes (0x07) in a chunk, ignoring 0x07 that appears
// inside a terminal string-sequence (OSC "ESC ]", DCS "ESC P", SOS "ESC X",
// PM "ESC ^", APC "ESC _"), where 0x07 is the sequence's BEL terminator — not a
// bell. The shell sets the window title / cwd via OSC on every prompt; naive
// bytes.Count(0x07) would tally those terminators and inflate the alert counter.
// Per-chunk (no cross-chunk state): prompt string-sequences are written atomically.
func countBells(chunk []byte) int {
	n := 0
	for i := 0; i < len(chunk); i++ {
		b := chunk[i]
		if b == 0x1b && i+1 < len(chunk) {
			switch chunk[i+1] {
			case ']', 'P', 'X', '^', '_': // enter a string-sequence
				i += 2
				for i < len(chunk) {
					if chunk[i] == 0x07 {
						break // BEL terminator — not a bell
					}
					if chunk[i] == 0x1b && i+1 < len(chunk) && chunk[i+1] == '\\' {
						i++ // consume ST's backslash
						break
					}
					i++
				}
				continue
			}
		}
		if b == 0x07 {
			n++
		}
	}
	return n
}

// Sink implements core.OutputSink. Output is coalesced by an OutputBatcher and
// emitted as base64 pty:output events; Exited flushes any pending bytes for the
// pane first, then emits pty:exited.
type Sink struct {
	emitter Emitter
	batcher *OutputBatcher
}

// NewSink builds a Sink. maxBytes is the per-pane size trigger for an immediate
// flush; the caller drives time-based flushes via Batcher().FlushAll on a ticker.
func NewSink(emitter Emitter, maxBytes int) *Sink {
	s := &Sink{emitter: emitter}
	s.batcher = NewOutputBatcher(maxBytes, func(id core.PaneID, data []byte) {
		emitter.Emit(EventOutput, OutputPayload{
			ID:    string(id),
			Chunk: base64.StdEncoding.EncodeToString(data),
		})
	})
	return s
}

// Batcher exposes the batcher so main can drive periodic FlushAll.
func (s *Sink) Batcher() *OutputBatcher { return s.batcher }

// Output is called from each pane's read-loop goroutine (must be concurrency-safe).
func (s *Sink) Output(id core.PaneID, chunk []byte) {
	if c := countBells(chunk); c > 0 {
		s.emitter.Emit(EventBell, BellPayload{ID: string(id), Count: c})
	}
	s.batcher.Add(id, chunk)
}

// Exited flushes buffered output for the pane, then notifies the frontend.
func (s *Sink) Exited(id core.PaneID, code int) {
	s.batcher.FlushPane(id)
	s.emitter.Emit(EventExited, ExitedPayload{ID: string(id), Code: code})
}
