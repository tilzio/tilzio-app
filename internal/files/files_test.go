package files

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadReturnsTextContent(t *testing.T) {
	p := filepath.Join(t.TempDir(), "a.txt")
	if err := os.WriteFile(p, []byte("hello\nworld"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := Read(p)
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if string(got) != "hello\nworld" {
		t.Fatalf("content = %q", got)
	}
}

func TestReadRejectsBinary(t *testing.T) {
	p := filepath.Join(t.TempDir(), "bin")
	if err := os.WriteFile(p, []byte{'a', 0x00, 'b'}, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Read(p); err != ErrBinary {
		t.Fatalf("err = %v, want ErrBinary", err)
	}
}

func TestReadRejectsTooLarge(t *testing.T) {
	p := filepath.Join(t.TempDir(), "big")
	if err := os.WriteFile(p, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Truncate(p, MaxFileBytes+1); err != nil { // sparse file, instant
		t.Fatal(err)
	}
	if _, err := Read(p); err != ErrTooLarge {
		t.Fatalf("err = %v, want ErrTooLarge", err)
	}
}

func TestWriteIsAtomicAndReadsBack(t *testing.T) {
	p := filepath.Join(t.TempDir(), "out.md")
	if err := Write(p, []byte("# hi")); err != nil {
		t.Fatalf("Write: %v", err)
	}
	got, _ := os.ReadFile(p)
	if string(got) != "# hi" {
		t.Fatalf("content = %q", got)
	}
	if _, err := os.Stat(p + ".tmp"); !os.IsNotExist(err) {
		t.Fatalf("temp file left behind")
	}
}

func TestStatPath(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "f.txt")
	_ = os.WriteFile(f, []byte("x"), 0o644)
	if s := StatPath(f); !s.Exists || s.IsDir {
		t.Fatalf("file stat = %+v", s)
	}
	if s := StatPath(dir); !s.Exists || !s.IsDir {
		t.Fatalf("dir stat = %+v", s)
	}
	if s := StatPath(filepath.Join(dir, "nope")); s.Exists {
		t.Fatalf("missing stat = %+v", s)
	}
}
