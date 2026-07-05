package core

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestLayoutSaveLoad(t *testing.T) {
	p := filepath.Join(t.TempDir(), "layout.json")
	ls := NewLayoutStore(p)
	want := []byte(`{"activeSpaceId":"s1"}`)
	if err := ls.Save(want); err != nil {
		t.Fatal(err)
	}
	got, err := ls.Load()
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(want) {
		t.Fatalf("got %q", got)
	}
}

func TestLayoutLoadMissing(t *testing.T) {
	ls := NewLayoutStore(filepath.Join(t.TempDir(), "layout.json"))
	if _, err := ls.Load(); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}

func TestLayoutLoadCorruptBacksUp(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "layout.json")
	if err := os.WriteFile(p, []byte("{not json"), 0o644); err != nil {
		t.Fatal(err)
	}
	ls := NewLayoutStore(p)
	if _, err := ls.Load(); !errors.Is(err, ErrCorrupt) {
		t.Fatalf("want ErrCorrupt, got %v", err)
	}
	if _, err := os.Stat(p); !os.IsNotExist(err) {
		t.Fatalf("expected original moved aside, stat err=%v", err)
	}
	matches, _ := filepath.Glob(p + ".corrupt-*")
	if len(matches) == 0 {
		t.Fatalf("expected a .corrupt-* backup file")
	}
}
