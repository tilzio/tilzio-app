package core

import (
	"errors"
	"os/exec"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"
)

// killEscalationDelay is how long Kill waits for the shell to exit after the
// SIGHUP hangup before SIGKILLing its process group. A package variable so
// tests can shorten the window.
var killEscalationDelay = 3 * time.Second

type session struct {
	id  PaneID
	pty *Pty
	// done is closed by readLoop once pty.Wait has reaped the child; it disarms
	// Kill's SIGKILL escalation timer.
	done chan struct{}
	// killed marks that the session ended because of an explicit Kill (pane
	// permanently closed) — its scrollback is then discarded, not flushed.
	killed atomic.Bool
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
	s := &session{id: id, pty: p, done: make(chan struct{})}
	m.mu.Lock()
	if _, exists := m.sess[id]; exists {
		m.mu.Unlock()
		_ = p.Close()
		// Reap the just-started shell we are discarding: Close only hangs it up;
		// without a Wait it would linger as a zombie until app exit.
		go func() { _ = p.Wait() }()
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
	// Wait has reaped the child — disarm any pending Kill escalation timer.
	close(s.done)
	// Release the PTY master fd on every exit path (idempotent; a no-op if
	// Kill already closed it). Without this, naturally-exiting shells leak
	// the master fd.
	_ = s.pty.Close()
	if m.sb != nil {
		if s.killed.Load() {
			// The pane was permanently closed (Kill): discard its scrollback —
			// ring and .log. App shutdown goes through FlushAll (not Kill), so
			// killed-on-quit panes keep their logs for §9 replay.
			_ = m.sb.Remove(s.id)
		} else {
			_ = m.sb.Flush(s.id)
		}
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
// reports Exited; it also removes the session from the map and discards the
// pane's scrollback (Kill = the pane is permanently closed).
//
// Escalation: a process that ignores SIGHUP would keep cmd.Wait blocked forever
// (stuck session, leaked readLoop, respawn impossible), so a goroutine SIGKILLs
// the shell's process group if Wait hasn't completed within killEscalationDelay.
// The timer is disarmed via s.done when readLoop's Wait returns.
func (m *SessionManager) Kill(id PaneID) error {
	s, err := m.get(id)
	if err != nil {
		// The shell may have already exited (`exit`, crash): no live session, but
		// the pane's ring/.log persist. Kill = permanent close, so the scrollback
		// goes too — otherwise every close-after-exit leaks a log file forever
		// (pane ids are never reused). Best-effort: Remove validates the id and
		// tolerates a missing file.
		if m.sb != nil {
			_ = m.sb.Remove(id)
		}
		return err
	}
	s.killed.Store(true)
	err = s.pty.Close()
	delay := killEscalationDelay // read on the caller's goroutine (racefree for tests overriding it)
	go func() {
		timer := time.NewTimer(delay)
		defer timer.Stop()
		select {
		case <-s.done:
		case <-timer.C:
			_ = s.pty.ForceKill()
		}
	}()
	return err
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
