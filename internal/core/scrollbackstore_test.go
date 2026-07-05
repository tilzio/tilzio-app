package core

import "testing"

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
