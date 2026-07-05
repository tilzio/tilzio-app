package core

import (
	"bytes"
	"errors"
	"sync"
	"testing"
	"time"
)

type fakeSink struct {
	mu     sync.Mutex
	out    []byte
	exited bool
	code   int
}

func (f *fakeSink) Output(_ PaneID, chunk []byte) {
	f.mu.Lock()
	f.out = append(f.out, chunk...)
	f.mu.Unlock()
}

func (f *fakeSink) Exited(_ PaneID, code int) {
	f.mu.Lock()
	f.exited = true
	f.code = code
	f.mu.Unlock()
}

func (f *fakeSink) contains(s string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return bytes.Contains(f.out, []byte(s))
}

func (f *fakeSink) hasExited() bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.exited
}

func (f *fakeSink) exitCode() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.code
}

// waitFor polls cond until true or fails after timeout.
func waitFor(t *testing.T, cond func() bool, timeout time.Duration, msg string) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("timeout: %s", msg)
}

func TestSessionManagerSpawnAndOutput(t *testing.T) {
	sb, _ := NewScrollbackStore(t.TempDir(), 1<<20)
	sink := &fakeSink{}
	m := NewSessionManager(sink, sb, "/bin/sh")
	if err := m.Spawn("p1", "", 80, 24); err != nil {
		t.Fatal(err)
	}
	if err := m.Write("p1", []byte("echo tilzio_ok\n")); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return sink.contains("tilzio_ok") }, 5*time.Second, "no echo output")
	if !bytes.Contains(sb.Snapshot("p1"), []byte("tilzio_ok")) {
		t.Fatalf("scrollback missing output: %q", sb.Snapshot("p1"))
	}
}

func TestSessionManagerNaturalExit(t *testing.T) {
	sink := &fakeSink{}
	sb, _ := NewScrollbackStore(t.TempDir(), 1<<20)
	m := NewSessionManager(sink, sb, "/bin/sh")
	if err := m.Spawn("p2", "", 80, 24); err != nil {
		t.Fatal(err)
	}
	if err := m.Write("p2", []byte("exit 0\n")); err != nil {
		t.Fatal(err)
	}
	waitFor(t, sink.hasExited, 5*time.Second, "session did not report exit")
	if got := sink.exitCode(); got != 0 {
		t.Fatalf("want exit code 0, got %d", got)
	}
	// After exit, the session must be removed from the manager.
	if err := m.Write("p2", []byte("x")); !errors.Is(err, ErrNoSession) {
		t.Fatalf("session should be gone after exit, got %v", err)
	}
}

func TestWriteUnknownSession(t *testing.T) {
	m := NewSessionManager(&fakeSink{}, nil, "/bin/sh")
	if err := m.Write("ghost", []byte("x")); !errors.Is(err, ErrNoSession) {
		t.Fatalf("want ErrNoSession, got %v", err)
	}
}

func TestSessionManagerResize(t *testing.T) {
	m := NewSessionManager(&fakeSink{}, nil, "/bin/sh")
	if err := m.Spawn("p3", "", 80, 24); err != nil {
		t.Fatal(err)
	}
	defer m.Kill("p3")
	if err := m.Resize("p3", 120, 40); err != nil {
		t.Fatalf("resize: %v", err)
	}
}

func TestSessionManagerKillTriggersExit(t *testing.T) {
	sink := &fakeSink{}
	m := NewSessionManager(sink, nil, "/bin/sh")
	if err := m.Spawn("p4", "", 80, 24); err != nil {
		t.Fatal(err)
	}
	if err := m.Kill("p4"); err != nil {
		t.Fatalf("kill: %v", err)
	}
	waitFor(t, sink.hasExited, 5*time.Second, "kill did not lead to Exited")
}

func TestResizeUnknownSession(t *testing.T) {
	m := NewSessionManager(&fakeSink{}, nil, "/bin/sh")
	if err := m.Resize("ghost", 80, 24); !errors.Is(err, ErrNoSession) {
		t.Fatalf("want ErrNoSession, got %v", err)
	}
}

func TestSpawnDuplicateIDFails(t *testing.T) {
	m := NewSessionManager(&fakeSink{}, nil, "/bin/sh")
	if err := m.Spawn("dup", "", 80, 24); err != nil {
		t.Fatal(err)
	}
	defer m.Kill("dup") // clean up the first (successful) spawn
	if err := m.Spawn("dup", "", 80, 24); !errors.Is(err, ErrAlreadySpawned) {
		t.Fatalf("want ErrAlreadySpawned, got %v", err)
	}
}

func TestSessionManagerFlushAll(t *testing.T) {
	dir := t.TempDir()
	sb, _ := NewScrollbackStore(dir, 1<<20)
	sink := &fakeSink{}
	m := NewSessionManager(sink, sb, "/bin/sh")
	if err := m.Spawn("p1", "", 80, 24); err != nil {
		t.Fatal(err)
	}
	defer m.Kill("p1")
	if err := m.Write("p1", []byte("echo flush_ok\n")); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool {
		return bytes.Contains(sb.Snapshot("p1"), []byte("flush_ok"))
	}, 5*time.Second, "no output in ring")

	if err := m.FlushAll(); err != nil {
		t.Fatal(err)
	}
	// The session is still ALIVE. A fresh store over the same dir loads what
	// FlushAll wrote — proving the live in-memory ring was persisted (design §12.5).
	sb2, _ := NewScrollbackStore(dir, 1<<20)
	data, err := sb2.Load("p1")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(data, []byte("flush_ok")) {
		t.Fatalf("flushed scrollback missing output: %q", data)
	}
}

func TestSessionManagerFlushAllNilStore(t *testing.T) {
	m := NewSessionManager(&fakeSink{}, nil, "/bin/sh")
	if err := m.FlushAll(); err != nil {
		t.Fatalf("FlushAll with nil store should be a no-op, got %v", err)
	}
}

// ShellTag without a live session falls back to the configured shell's basename (S4.5).
func TestShellTagFallbackToShellBasename(t *testing.T) {
	m := NewSessionManager(&fakeSink{}, nil, "/bin/zsh")
	if got := m.ShellTag("no-such-pane"); got != "zsh" {
		t.Fatalf("ShellTag fallback = %q, want zsh", got)
	}
}

// Empty shell → defaultShell() basename (never empty).
func TestShellTagEmptyShellDefaults(t *testing.T) {
	m := NewSessionManager(&fakeSink{}, nil, "") // empty → defaultShell basename
	if got := m.ShellTag("x"); got == "" {
		t.Fatalf("ShellTag empty shell should fall back to a basename, got empty")
	}
}

// Live session: the tag is non-empty (foreground name or shell basename as fallback).
func TestShellTagLiveSessionNonEmpty(t *testing.T) {
	m := NewSessionManager(&fakeSink{}, nil, "/bin/sh")
	if err := m.Spawn("st1", "", 80, 24); err != nil {
		t.Fatal(err)
	}
	defer m.Kill("st1")
	if got := m.ShellTag("st1"); got == "" {
		t.Fatalf("ShellTag for a live session should be non-empty")
	}
}
