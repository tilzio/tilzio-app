package core

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
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

// A shell that ignores SIGHUP must still be reaped: Kill escalates to SIGKILL of
// the process group after killEscalationDelay. Without escalation, cmd.Wait
// blocks forever → the session is stuck in the map, the readLoop goroutine
// leaks, and the pane can never be respawned.
func TestKillEscalatesToSigkillWhenHupIgnored(t *testing.T) {
	script := filepath.Join(t.TempDir(), "stubborn.sh")
	if err := os.WriteFile(script, []byte("#!/bin/sh\ntrap '' HUP\necho READY\nsleep 60\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	old := killEscalationDelay
	killEscalationDelay = 200 * time.Millisecond
	defer func() { killEscalationDelay = old }()

	sink := &fakeSink{}
	m := NewSessionManager(sink, nil, script)
	if err := m.Spawn("hup", "", 80, 24); err != nil {
		t.Fatal(err)
	}
	// Only kill once the trap is installed, so plain SIGHUP cannot win the race.
	waitFor(t, func() bool { return sink.contains("READY") }, 5*time.Second, "script did not start")
	if err := m.Kill("hup"); err != nil {
		t.Fatalf("kill: %v", err)
	}
	waitFor(t, sink.hasExited, 5*time.Second, "HUP-ignoring shell was not reaped by the SIGKILL escalation")
	// The session must be gone, so the pane can be respawned.
	if err := m.Write("hup", []byte("x")); !errors.Is(err, ErrNoSession) {
		t.Fatalf("session should be gone after escalated kill, got %v", err)
	}
}

// Kill permanently closes a pane: its in-memory ring is dropped and the
// persisted .log deleted. (Shutdown goes through FlushAll, not Kill, so
// killed-on-quit panes keep their logs for §9 replay — TestSessionManagerFlushAll.)
func TestKillRemovesScrollbackRingAndLogFile(t *testing.T) {
	dir := t.TempDir()
	sb, _ := NewScrollbackStore(dir, 1<<20)
	sink := &fakeSink{}
	m := NewSessionManager(sink, sb, "/bin/sh")
	if err := m.Spawn("pk", "", 80, 24); err != nil {
		t.Fatal(err)
	}
	if err := m.Write("pk", []byte("echo kill_me\n")); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool {
		return bytes.Contains(sb.Snapshot("pk"), []byte("kill_me"))
	}, 5*time.Second, "no output in ring")
	// Persist a .log (like an earlier shutdown flush) so Kill has a file to delete.
	if err := sb.Flush("pk"); err != nil {
		t.Fatal(err)
	}
	logPath := filepath.Join(dir, "pk.log")
	if _, err := os.Stat(logPath); err != nil {
		t.Fatalf("setup: log file should exist: %v", err)
	}
	if err := m.Kill("pk"); err != nil {
		t.Fatal(err)
	}
	waitFor(t, sink.hasExited, 5*time.Second, "kill did not lead to Exited")
	if _, err := os.Stat(logPath); !os.IsNotExist(err) {
		t.Fatalf("killed pane's log must be deleted, stat err=%v", err)
	}
	if got := sb.Snapshot("pk"); len(got) != 0 {
		t.Fatalf("killed pane's ring must be dropped, got %q", got)
	}
}

// Natural exit (NOT Kill) keeps flushing the scrollback file for §9 replay.
func TestNaturalExitStillFlushesScrollback(t *testing.T) {
	dir := t.TempDir()
	sb, _ := NewScrollbackStore(dir, 1<<20)
	sink := &fakeSink{}
	m := NewSessionManager(sink, sb, "/bin/sh")
	if err := m.Spawn("pn", "", 80, 24); err != nil {
		t.Fatal(err)
	}
	if err := m.Write("pn", []byte("echo bye; exit 0\n")); err != nil {
		t.Fatal(err)
	}
	waitFor(t, sink.hasExited, 5*time.Second, "no exit")
	if _, err := os.Stat(filepath.Join(dir, "pn.log")); err != nil {
		t.Fatalf("natural exit must keep the flushed log: %v", err)
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

// A pane whose shell already exited (user typed `exit`, process died) has no live
// session, but its ring/.log persist. Permanently closing the pane still goes
// through Kill — the scrollback must be discarded on the no-session path too,
// otherwise every close-after-exit leaks a log file forever (pane ids are never
// reused).
func TestKillOfDeadPaneStillRemovesScrollback(t *testing.T) {
	dir := t.TempDir()
	sb, _ := NewScrollbackStore(dir, 1<<20)
	m := NewSessionManager(&fakeSink{}, sb, "/bin/sh")
	sb.Append("dead", []byte("old output"))
	if err := sb.Flush("dead"); err != nil {
		t.Fatal(err)
	}
	logPath := filepath.Join(dir, "dead.log")
	if _, err := os.Stat(logPath); err != nil {
		t.Fatalf("setup: log file should exist: %v", err)
	}
	if err := m.Kill("dead"); err == nil {
		t.Fatal("Kill of a dead pane should still report the missing session")
	}
	if _, err := os.Stat(logPath); !os.IsNotExist(err) {
		t.Fatalf("dead pane's log must be deleted on close, stat err=%v", err)
	}
	if got := sb.Snapshot("dead"); len(got) != 0 {
		t.Fatalf("dead pane's ring must be dropped, got %q", got)
	}
}
