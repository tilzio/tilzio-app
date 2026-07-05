package core

import "sync"

// RingBuffer is a byte-capped, append-only buffer. When appends exceed the
// cap, the oldest bytes are dropped so the buffer holds the most recent
// capBytes. Safe for concurrent use.
type RingBuffer struct {
	mu  sync.Mutex
	buf []byte
	cap int
}

func NewRingBuffer(capBytes int) *RingBuffer {
	if capBytes <= 0 {
		capBytes = DefaultScrollbackBytes
	}
	return &RingBuffer{cap: capBytes}
}

func (r *RingBuffer) Append(p []byte) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.buf = append(r.buf, p...)
	if len(r.buf) > r.cap {
		// Re-slice into a fresh backing array so the dropped prefix can be GC'd.
		r.buf = append([]byte(nil), r.buf[len(r.buf)-r.cap:]...)
	}
}

func (r *RingBuffer) Snapshot() []byte {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]byte, len(r.buf))
	copy(out, r.buf)
	return out
}
