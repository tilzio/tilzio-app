package core

import (
	"os"
	"path/filepath"
	"regexp"
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

// paneIDRe restricts pane ids to a safe filename charset before they are used
// to build paths under s.dir (same approach as internal/files/draft.go): a
// crafted id like "../../../tmp/evil" must never become a file operation.
var paneIDRe = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

func (s *ScrollbackStore) path(id PaneID) (string, error) {
	if !paneIDRe.MatchString(string(id)) {
		return "", ErrBadPaneID
	}
	return filepath.Join(s.dir, string(id)+".log"), nil
}

// Flush writes the current snapshot for a pane to disk (overwrite).
func (s *ScrollbackStore) Flush(id PaneID) error {
	p, err := s.path(id)
	if err != nil {
		return err
	}
	return os.WriteFile(p, s.Snapshot(id), 0o644)
}

// Remove permanently discards a pane's scrollback: the in-memory ring entry is
// dropped and the persisted .log deleted. Cleanup path for a pane that was
// killed (permanently closed) — NOT called on app shutdown, where FlushAll must
// keep logs for §9 replay. A missing file is not an error.
func (s *ScrollbackStore) Remove(id PaneID) error {
	p, err := s.path(id)
	if err != nil {
		return err
	}
	s.mu.Lock()
	delete(s.bufs, id)
	s.mu.Unlock()
	if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// Load replaces the pane's in-memory ring with its persisted scrollback and
// returns the bytes. Returns (nil, nil) if no file exists. Idempotent: calling
// it repeatedly yields the same in-memory state (it does not accumulate).
func (s *ScrollbackStore) Load(id PaneID) ([]byte, error) {
	p, err := s.path(id)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(p)
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
