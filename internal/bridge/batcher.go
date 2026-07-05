package bridge

import (
	"sync"

	"github.com/tilzio/tilzio/internal/core"
)

// FlushFunc delivers a pane's coalesced output. It is called while the
// batcher's mutex is held, so it must not call back into the batcher.
type FlushFunc func(id core.PaneID, data []byte)

// OutputBatcher coalesces per-pane PTY output and releases it in batches to
// bound the frontend event rate (spec §9/§10). A pane is flushed either when
// FlushAll runs (driven by a ~16ms ticker in main) or immediately once its
// pending bytes reach maxBytes (burst protection). Flushes happen under the
// mutex so per-pane byte order is preserved. Safe for concurrent use.
type OutputBatcher struct {
	mu       sync.Mutex
	pending  map[core.PaneID][]byte
	flush    FlushFunc
	maxBytes int
}

func NewOutputBatcher(maxBytes int, flush FlushFunc) *OutputBatcher {
	if maxBytes <= 0 {
		maxBytes = 64 * 1024
	}
	return &OutputBatcher{
		pending:  map[core.PaneID][]byte{},
		flush:    flush,
		maxBytes: maxBytes,
	}
}

// Add appends a chunk for a pane, flushing that pane immediately if it reaches
// the size trigger.
func (b *OutputBatcher) Add(id core.PaneID, chunk []byte) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.pending[id] = append(b.pending[id], chunk...)
	if len(b.pending[id]) >= b.maxBytes {
		b.flushLocked(id)
	}
}

// FlushPane flushes a single pane's pending bytes (if any).
func (b *OutputBatcher) FlushPane(id core.PaneID) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.flushLocked(id)
}

// FlushAll flushes every pane with pending bytes.
func (b *OutputBatcher) FlushAll() {
	b.mu.Lock()
	defer b.mu.Unlock()
	for id := range b.pending {
		b.flushLocked(id)
	}
}

// flushLocked emits and clears one pane. Caller must hold b.mu. Deleting the
// key during a FlushAll range loop is safe in Go.
func (b *OutputBatcher) flushLocked(id core.PaneID) {
	data := b.pending[id]
	delete(b.pending, id)
	if len(data) > 0 {
		b.flush(id, data)
	}
}
