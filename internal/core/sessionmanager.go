package core

import (
	"errors"
	"os/exec"
	"path/filepath"
	"sync"
)

type session struct {
	id  PaneID
	pty *Pty
}

// SessionManager owns all live PTY sessions and wires their output to the
// scrollback store and the OutputSink.
type SessionManager struct {
	mu    sync.Mutex
	sess  map[PaneID]*session
	sink  OutputSink
	sb    *ScrollbackStore // may be nil (tests/no-persist)
	shell string
}

func NewSessionManager(sink OutputSink, sb *ScrollbackStore, shell string) *SessionManager {
	return &SessionManager{
		sess:  map[PaneID]*session{},
		sink:  sink,
		sb:    sb,
		shell: shell,
	}
}

func (m *SessionManager) Spawn(id PaneID, cwd string, cols, rows uint16) error {
	p, err := OpenPty(m.shell, cwd, cols, rows)
	if err != nil {
		return err
	}
	s := &session{id: id, pty: p}
	m.mu.Lock()
	if _, exists := m.sess[id]; exists {
		m.mu.Unlock()
		_ = p.Close()
		return ErrAlreadySpawned
	}
	m.sess[id] = s
	m.mu.Unlock()
	go m.readLoop(s)
	return nil
}

func (m *SessionManager) readLoop(s *session) {
	buf := make([]byte, 32*1024)
	for {
		n, err := s.pty.Read(buf)
		if n > 0 {
			chunk := make([]byte, n)
			copy(chunk, buf[:n])
			if m.sb != nil {
				m.sb.Append(s.id, chunk)
			}
			m.sink.Output(s.id, chunk)
		}
		if err != nil {
			break
		}
	}
	code := 0
	if err := s.pty.Wait(); err != nil {
		var ee *exec.ExitError
		if errors.As(err, &ee) {
			code = ee.ExitCode()
		} else {
			code = -1
		}
	}
	// Release the PTY master fd on every exit path (idempotent; a no-op if
	// Kill already closed it). Without this, naturally-exiting shells leak
	// the master fd.
	_ = s.pty.Close()
	if m.sb != nil {
		_ = m.sb.Flush(s.id)
	}
	m.mu.Lock()
	delete(m.sess, s.id)
	m.mu.Unlock()
	m.sink.Exited(s.id, code)
}

// ShellTag returns a short label for what is running in a pane: the foreground
// process basename when resolvable (e.g. "vitest"), otherwise the basename of the
// configured shell (e.g. "zsh"). NEVER empty — the fallback guarantees a tag even
// without a live session. READ-ONLY (§9): does not touch spawn/kill/scrollback.
func (m *SessionManager) ShellTag(id PaneID) string {
	if s, err := m.get(id); err == nil {
		if fg := s.pty.ForegroundName(); fg != "" {
			return fg
		}
	}
	sh := m.shell
	if sh == "" {
		sh = defaultShell()
	}
	return filepath.Base(sh)
}

func (m *SessionManager) get(id PaneID) (*session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sess[id]
	if !ok {
		return nil, ErrNoSession
	}
	return s, nil
}

func (m *SessionManager) Write(id PaneID, data []byte) error {
	s, err := m.get(id)
	if err != nil {
		return err
	}
	_, err = s.pty.Write(data)
	return err
}

func (m *SessionManager) Resize(id PaneID, cols, rows uint16) error {
	s, err := m.get(id)
	if err != nil {
		return err
	}
	return s.pty.Resize(cols, rows)
}

// Kill terminates a pane's shell. The read loop observes the closed PTY and
// reports Exited; it also removes the session from the map.
func (m *SessionManager) Kill(id PaneID) error {
	s, err := m.get(id)
	if err != nil {
		return err
	}
	return s.pty.Close()
}

// FlushAll writes every live session's in-memory scrollback ring to disk. Called
// from the app's OnShutdown hook so a restart can replay real history (design
// §12.5). Snapshots the id set under the lock, then flushes outside it (Flush
// takes the store's own lock). No-op when the store is absent (tests/no-persist).
func (m *SessionManager) FlushAll() error {
	if m.sb == nil {
		return nil
	}
	m.mu.Lock()
	ids := make([]PaneID, 0, len(m.sess))
	for id := range m.sess {
		ids = append(ids, id)
	}
	m.mu.Unlock()
	var firstErr error
	for _, id := range ids {
		if err := m.sb.Flush(id); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}
