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

// ⌘S must not reset an existing file's permissions to 0644.
func TestWritePreservesPermissions(t *testing.T) {
	p := filepath.Join(t.TempDir(), "secret.md")
	if err := os.WriteFile(p, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := Write(p, []byte("new")); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(p)
	if err != nil {
		t.Fatal(err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Fatalf("perm = %o, want 0600", got)
	}
	got, _ := os.ReadFile(p)
	if string(got) != "new" {
		t.Fatalf("content = %q", got)
	}
}

// Saving through a symlink must update the TARGET file and keep the link intact
// (a rename onto the link path would replace the symlink with a regular file).
func TestWriteThroughSymlinkKeepsLinkAndUpdatesTarget(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "real.md")
	link := filepath.Join(dir, "link.md")
	if err := os.WriteFile(target, []byte("old"), 0o640); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
	if err := Write(link, []byte("new")); err != nil {
		t.Fatal(err)
	}
	fi, err := os.Lstat(link)
	if err != nil || fi.Mode()&os.ModeSymlink == 0 {
		t.Fatalf("symlink replaced by a regular file (mode %v, err %v)", fi.Mode(), err)
	}
	got, _ := os.ReadFile(target)
	if string(got) != "new" {
		t.Fatalf("target content = %q", got)
	}
	if ti, _ := os.Stat(target); ti.Mode().Perm() != 0o640 {
		t.Fatalf("target perm = %o, want 0640", ti.Mode().Perm())
	}
}

// A brand-new file gets the 0644 default.
func TestWriteNewFileDefaults0644(t *testing.T) {
	p := filepath.Join(t.TempDir(), "new.md")
	if err := Write(p, []byte("x")); err != nil {
		t.Fatal(err)
	}
	fi, err := os.Stat(p)
	if err != nil {
		t.Fatal(err)
	}
	if fi.Mode().Perm() != 0o644 {
		t.Fatalf("perm = %o, want 0644", fi.Mode().Perm())
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
