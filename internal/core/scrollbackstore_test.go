package core

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestScrollbackAppendSnapshot(t *testing.T) {
	s, err := NewScrollbackStore(t.TempDir(), 1024)
	if err != nil {
		t.Fatal(err)
	}
	s.Append("p1", []byte("foo"))
	s.Append("p1", []byte("bar"))
	if got := string(s.Snapshot("p1")); got != "foobar" {
		t.Fatalf("got %q", got)
	}
}

func TestScrollbackFlushLoad(t *testing.T) {
	dir := t.TempDir()
	s, _ := NewScrollbackStore(dir, 1024)
	s.Append("p1", []byte("hello world"))
	if err := s.Flush("p1"); err != nil {
		t.Fatal(err)
	}

	s2, _ := NewScrollbackStore(dir, 1024)
	data, err := s2.Load("p1")
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "hello world" {
		t.Fatalf("loaded %q", data)
	}
	if got := string(s2.Snapshot("p1")); got != "hello world" {
		t.Fatalf("snapshot %q", got)
	}
}

func TestScrollbackLoadMissingIsEmpty(t *testing.T) {
	s, _ := NewScrollbackStore(t.TempDir(), 1024)
	data, err := s.Load("nope")
	if err != nil {
		t.Fatalf("unexpected err %v", err)
	}
	if data != nil {
		t.Fatalf("want nil, got %q", data)
	}
}

func TestScrollbackStoreRespectsCap(t *testing.T) {
	s, err := NewScrollbackStore(t.TempDir(), 4)
	if err != nil {
		t.Fatal(err)
	}
	s.Append("p1", []byte("abcdef"))
	if got := string(s.Snapshot("p1")); got != "cdef" {
		t.Fatalf("want tail within cap %q, got %q", "cdef", got)
	}
}

// A crafted pane id must not escape the scrollback dir (path traversal): every
// file-touching method validates the id first and performs no file op on failure.
func TestScrollbackRejectsTraversalPaneID(t *testing.T) {
	dir := t.TempDir()
	s, _ := NewScrollbackStore(dir, 1024)
	evil := PaneID("../../../tmp/evil")
	s.Append(evil, []byte("x")) // in-memory only; must not touch disk
	if err := s.Flush(evil); !errors.Is(err, ErrBadPaneID) {
		t.Fatalf("Flush: want ErrBadPaneID, got %v", err)
	}
	if _, err := s.Load(evil); !errors.Is(err, ErrBadPaneID) {
		t.Fatalf("Load: want ErrBadPaneID, got %v", err)
	}
	if err := s.Remove(evil); !errors.Is(err, ErrBadPaneID) {
		t.Fatalf("Remove: want ErrBadPaneID, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "..", "..", "..", "tmp", "evil.log")); err == nil {
		t.Fatal("traversal file must not be created")
	}
	// Normal UUID-style ids (letters/digits/hyphen/underscore) still work.
	if err := s.Flush("a1B2-c3_d4"); err != nil {
		t.Fatalf("valid id rejected: %v", err)
	}
}

// Remove drops both the in-memory ring and the persisted .log (Kill cleanup).
func TestScrollbackRemoveDeletesRingAndFile(t *testing.T) {
	dir := t.TempDir()
	s, _ := NewScrollbackStore(dir, 1024)
	s.Append("p1", []byte("data"))
	if err := s.Flush("p1"); err != nil {
		t.Fatal(err)
	}
	if err := s.Remove("p1"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "p1.log")); !os.IsNotExist(err) {
		t.Fatalf("log should be deleted, stat err=%v", err)
	}
	if got := s.Snapshot("p1"); len(got) != 0 {
		t.Fatalf("ring should be dropped, got %q", got)
	}
	// Removing again (no file, no ring) is a no-op.
	if err := s.Remove("p1"); err != nil {
		t.Fatalf("second Remove should be nil, got %v", err)
	}
}

func TestScrollbackLoadIsIdempotent(t *testing.T) {
	dir := t.TempDir()
	s, _ := NewScrollbackStore(dir, 1024)
	s.Append("p1", []byte("hello"))
	if err := s.Flush("p1"); err != nil {
		t.Fatal(err)
	}
	s2, _ := NewScrollbackStore(dir, 1024)
	if _, err := s2.Load("p1"); err != nil {
		t.Fatal(err)
	}
	if _, err := s2.Load("p1"); err != nil {
		t.Fatal(err)
	}
	if got := string(s2.Snapshot("p1")); got != "hello" {
		t.Fatalf("Load not idempotent: got %q", got)
	}
}
