package core

import (
	"os"
	"path/filepath"
	"sync"
)

// ScrollbackStore keeps a per-pane RingBuffer of recent output in memory and
// can flush/load it to disk for session restore.
type ScrollbackStore struct {
	mu   sync.Mutex
	dir  string
	cap  int
	bufs map[PaneID]*RingBuffer
}

func NewScrollbackStore(dir string, capBytes int) (*ScrollbackStore, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return &ScrollbackStore{dir: dir, cap: capBytes, bufs: map[PaneID]*RingBuffer{}}, nil
}

func (s *ScrollbackStore) ring(id PaneID) *RingBuffer {
	s.mu.Lock()
	defer s.mu.Unlock()
	rb, ok := s.bufs[id]
	if !ok {
		rb = NewRingBuffer(s.cap)
		s.bufs[id] = rb
	}
	return rb
}

func (s *ScrollbackStore) Append(id PaneID, p []byte) { s.ring(id).Append(p) }

func (s *ScrollbackStore) Snapshot(id PaneID) []byte { return s.ring(id).Snapshot() }

func (s *ScrollbackStore) path(id PaneID) string {
	return filepath.Join(s.dir, string(id)+".log")
}

// Flush writes the current snapshot for a pane to disk (overwrite).
func (s *ScrollbackStore) Flush(id PaneID) error {
	return os.WriteFile(s.path(id), s.Snapshot(id), 0o644)
}

// Load replaces the pane's in-memory ring with its persisted scrollback and
// returns the bytes. Returns (nil, nil) if no file exists. Idempotent: calling
// it repeatedly yields the same in-memory state (it does not accumulate).
func (s *ScrollbackStore) Load(id PaneID) ([]byte, error) {
	data, err := os.ReadFile(s.path(id))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	rb := NewRingBuffer(s.cap)
	rb.Append(data)
	s.mu.Lock()
	s.bufs[id] = rb
	s.mu.Unlock()
	return data, nil
}
