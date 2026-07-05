package core

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestCoreEndToEnd(t *testing.T) {
	sink := &fakeSink{}
	c, err := NewCore(sink, t.TempDir(), "/bin/sh")
	if err != nil {
		t.Fatal(err)
	}
	if err := c.Spawn("p1", "", 80, 24); err != nil {
		t.Fatal(err)
	}
	if err := c.Write("p1", []byte("echo core_ok\n")); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return sink.contains("core_ok") }, 5*time.Second, "no output via Core")
	_ = c.Kill("p1")
}

func TestCoreLayoutRoundTrip(t *testing.T) {
	c, err := NewCore(&fakeSink{}, t.TempDir(), "/bin/sh")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := c.LoadLayout(); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
	want := []byte(`{"activeSpaceId":"s1","spaces":[]}`)
	if err := c.SaveLayout(want); err != nil {
		t.Fatal(err)
	}
	got, err := c.LoadLayout()
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(want) {
		t.Fatalf("got %q", got)
	}
}

func TestCoreLoadScrollback(t *testing.T) {
	sink := &fakeSink{}
	c, err := NewCore(sink, t.TempDir(), "/bin/sh")
	if err != nil {
		t.Fatal(err)
	}
	if err := c.Spawn("p1", "", 80, 24); err != nil {
		t.Fatal(err)
	}
	if err := c.Write("p1", []byte("echo scrollback_ok\n")); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return sink.contains("scrollback_ok") }, 5*time.Second, "no output")
	_ = c.Kill("p1")
	// Kill -> read loop flushes scrollback to disk on exit; wait for that, then
	// LoadScrollback must return the persisted bytes including our echo.
	waitFor(t, func() bool {
		b, err := c.LoadScrollback("p1")
		return err == nil && strings.Contains(string(b), "scrollback_ok")
	}, 5*time.Second, "scrollback not persisted/loadable")
}

func TestCoreLoadScrollbackLiveSession(t *testing.T) {
	sink := &fakeSink{}
	c, err := NewCore(sink, t.TempDir(), "/bin/sh")
	if err != nil {
		t.Fatal(err)
	}
	if err := c.Spawn("p1", "", 80, 24); err != nil {
		t.Fatal(err)
	}
	if err := c.Write("p1", []byte("echo live_ok\n")); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return sink.contains("live_ok") }, 5*time.Second, "no output")
	// The session is still ALIVE (not killed). The on-disk .log is only written
	// on exit, so for a live pane LoadScrollback must return the in-memory ring
	// (the live output) — this is the §9 replay-on-tab-switch path (Plan 3b).
	// Without the in-memory snapshot, a tab switch replays an empty buffer.
	b, err := c.LoadScrollback("p1")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), "live_ok") {
		t.Fatalf("live-session scrollback empty: got %q", b)
	}
	_ = c.Kill("p1")
}

func TestCoreFlushAll(t *testing.T) {
	dir := t.TempDir()
	sink := &fakeSink{}
	c, err := NewCore(sink, dir, "/bin/sh")
	if err != nil {
		t.Fatal(err)
	}
	if err := c.Spawn("p1", "", 80, 24); err != nil {
		t.Fatal(err)
	}
	defer c.Kill("p1")
	if err := c.Write("p1", []byte("echo flushall_ok\n")); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return sink.contains("flushall_ok") }, 5*time.Second, "no output via Core")

	if err := c.FlushAll(); err != nil {
		t.Fatal(err)
	}
	// The live pane's ring is now on disk at <dir>/scrollback/p1.log (NewCore
	// joins "scrollback" under dataDir; ScrollbackStore names files <id>.log).
	data, err := os.ReadFile(filepath.Join(dir, "scrollback", "p1.log"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "flushall_ok") {
		t.Fatalf("flushed file missing output: %q", data)
	}
}
