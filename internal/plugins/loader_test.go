package plugins

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// writePlugin creates pluginsDir/<dir>/manifest.json with the given content.
// (Shared helper for loader_test and service_test — same package.)
func writePlugin(t *testing.T, pluginsDir, dir, manifest string) string {
	t.Helper()
	pdir := filepath.Join(pluginsDir, dir)
	if err := os.MkdirAll(pdir, 0o755); err != nil {
		t.Fatal(err)
	}
	if manifest != "" {
		if err := os.WriteFile(filepath.Join(pdir, "manifest.json"), []byte(manifest), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return pdir
}

func TestDiscover(t *testing.T) {
	root := t.TempDir()
	writePlugin(t, root, "git", `{"id":"dev.term.git","name":"Git","version":"1","engine":"tilzio@1","entry":"main.js"}`)
	writePlugin(t, root, "broken", `{not json`)
	dirs, items := Discover(root)
	if len(dirs) != 1 || dirs["dev.term.git"] == "" {
		t.Fatalf("valid plugin not in dirs: %v", dirs)
	}
	var okCount, errCount int
	for _, it := range items {
		if it.Err == "" {
			okCount++
		} else {
			errCount++
		}
	}
	if okCount != 1 || errCount != 1 {
		t.Fatalf("want 1 ok + 1 broken, got items=%+v", items)
	}
}

func TestDiscoverDuplicateID(t *testing.T) {
	root := t.TempDir()
	writePlugin(t, root, "a-first", `{"id":"dup","name":"A","version":"1","engine":"tilzio@1","entry":"main.js"}`)
	writePlugin(t, root, "b-second", `{"id":"dup","name":"B","version":"1","engine":"tilzio@1","entry":"main.js"}`)
	dirs, items := Discover(root)
	if len(dirs) != 1 {
		t.Fatalf("duplicate id should map once, got %v", dirs)
	}
	var dupErr bool
	for _, it := range items {
		if strings.Contains(it.Err, "duplicate id") {
			dupErr = true
		}
	}
	if !dupErr {
		t.Fatal("expected a duplicate id error item")
	}
}

func TestDiscoverMissingDir(t *testing.T) {
	dirs, items := Discover(filepath.Join(t.TempDir(), "does-not-exist"))
	if len(dirs) != 0 || len(items) != 0 {
		t.Fatalf("missing dir should be empty, got dirs=%v items=%v", dirs, items)
	}
}

func TestSecureReadOK(t *testing.T) {
	base := t.TempDir()
	if err := os.WriteFile(filepath.Join(base, "main.js"), []byte("console.log(1)"), 0o644); err != nil {
		t.Fatal(err)
	}
	data, err := secureRead(base, "main.js")
	if err != nil || string(data) != "console.log(1)" {
		t.Fatalf("data=%q err=%v", data, err)
	}
}

func TestSecureReadTraversal(t *testing.T) {
	base := t.TempDir()
	secret := filepath.Join(filepath.Dir(base), "secret.txt")
	_ = os.WriteFile(secret, []byte("SECRET"), 0o644)
	for _, rel := range []string{"../secret.txt", "../../secret.txt", "/etc/hostname"} {
		data, err := secureRead(base, rel)
		if err == nil && strings.Contains(string(data), "SECRET") {
			t.Fatalf("traversal %q escaped base", rel)
		}
	}
}

func TestSecureReadSymlinkEscape(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink test is POSIX-focused")
	}
	base := t.TempDir()
	secret := filepath.Join(filepath.Dir(base), "secret.txt")
	if err := os.WriteFile(secret, []byte("SECRET"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(secret, filepath.Join(base, "escape")); err != nil {
		t.Fatal(err)
	}
	data, err := secureRead(base, "escape")
	if err == nil && strings.Contains(string(data), "SECRET") {
		t.Fatal("symlink escaped the plugin folder")
	}
}

func TestSecureReadTooLarge(t *testing.T) {
	base := t.TempDir()
	if err := os.WriteFile(filepath.Join(base, "big.bin"), make([]byte, MaxReadBytes+1), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := secureRead(base, "big.bin"); err == nil {
		t.Fatal("expected error for oversized file")
	}
}

func TestSecureReadSubdir(t *testing.T) {
	base := t.TempDir()
	if err := os.MkdirAll(filepath.Join(base, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(base, "assets", "icon.svg"), []byte("<svg/>"), 0o644); err != nil {
		t.Fatal(err)
	}
	// A legitimate nested asset (icons live in subdirs) must read correctly.
	data, err := secureRead(base, "assets/icon.svg")
	if err != nil || string(data) != "<svg/>" {
		t.Fatalf("legitimate nested read failed: data=%q err=%v", data, err)
	}
}

func TestSecureReadReRootsInsideBase(t *testing.T) {
	base := t.TempDir()
	// A decoy INSIDE base with the same name a traversal would target.
	if err := os.WriteFile(filepath.Join(base, "secret.txt"), []byte("DECOY"), 0o644); err != nil {
		t.Fatal(err)
	}
	// A real secret OUTSIDE base (sibling of base).
	outside := filepath.Join(filepath.Dir(base), "secret.txt")
	if err := os.WriteFile(outside, []byte("SECRET"), 0o644); err != nil {
		t.Fatal(err)
	}
	// "../secret.txt" must re-root to <base>/secret.txt (the decoy), proving the
	// path was scoped to base rather than reaching the sibling SECRET.
	data, err := secureRead(base, "../secret.txt")
	if err != nil {
		t.Fatalf("re-rooted read should hit the in-base decoy, got err=%v", err)
	}
	if string(data) != "DECOY" {
		t.Fatalf("traversal escaped base: got %q, want DECOY", data)
	}
}
