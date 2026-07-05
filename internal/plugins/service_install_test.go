package plugins

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func manifestJSON(id, version string) string {
	return `{"id":"` + id + `","name":"X","version":"` + version + `","engine":"tilzio@1","entry":"main.js"}`
}

func newTestService(t *testing.T) *Service {
	t.Helper()
	dir := t.TempDir()
	return NewService(filepath.Join(dir, "plugins"), filepath.Join(dir, "plugins.json"))
}

func TestInstallZipNew(t *testing.T) {
	s := newTestService(t)
	data := makeZip(t, map[string]string{"manifest.json": manifestJSON("dev.x", "1.0.0"), "main.js": "//x"})
	res, err := s.InstallZip(data, false)
	if err != nil {
		t.Fatalf("InstallZip: %v", err)
	}
	if res.Status != "installed" || res.Info == nil || res.Info.Manifest.ID != "dev.x" {
		t.Fatalf("bad result: %+v", res)
	}
	if _, err := os.Stat(filepath.Join(s.pluginsDir, "dev.x", "main.js")); err != nil {
		t.Fatalf("file not installed: %v", err)
	}
	if res.Info.Enabled {
		t.Fatalf("new plugin must be disabled")
	}
}

func TestInstallZipConflict(t *testing.T) {
	s := newTestService(t)
	first := makeZip(t, map[string]string{"manifest.json": manifestJSON("dev.x", "1.0.0"), "main.js": "//a"})
	s.InstallZip(first, false)
	second := makeZip(t, map[string]string{"manifest.json": manifestJSON("dev.x", "2.0.0"), "main.js": "//b"})
	res, err := s.InstallZip(second, false)
	if err != nil {
		t.Fatalf("InstallZip: %v", err)
	}
	if res.Status != "conflict" || res.Conflict == nil {
		t.Fatalf("expected conflict, got %+v", res)
	}
	if res.Conflict.ExistingVersion != "1.0.0" || res.Conflict.NewVersion != "2.0.0" {
		t.Fatalf("bad conflict versions: %+v", res.Conflict)
	}
	b, _ := os.ReadFile(filepath.Join(s.pluginsDir, "dev.x", "main.js"))
	if string(b) != "//a" {
		t.Fatalf("conflict must not overwrite, got %q", b)
	}
}

func TestInstallZipOverwriteKeepsState(t *testing.T) {
	s := newTestService(t)
	s.InstallZip(makeZip(t, map[string]string{"manifest.json": manifestJSON("dev.x", "1.0.0"), "main.js": "//a"}), false)
	s.SetEnabled("dev.x", true)
	res, err := s.InstallZip(makeZip(t, map[string]string{"manifest.json": manifestJSON("dev.x", "2.0.0"), "main.js": "//b"}), true)
	if err != nil || res.Status != "installed" {
		t.Fatalf("overwrite failed: %+v err=%v", res, err)
	}
	b, _ := os.ReadFile(filepath.Join(s.pluginsDir, "dev.x", "main.js"))
	if string(b) != "//b" {
		t.Fatalf("overwrite must replace code, got %q", b)
	}
	if enabled, _, ok := s.store.State("dev.x"); !ok || !enabled {
		t.Fatalf("overwrite must keep enabled state")
	}
}

func TestInstallZipBadManifest(t *testing.T) {
	s := newTestService(t)
	data := makeZip(t, map[string]string{"manifest.json": `{"id":""}`, "main.js": "//x"})
	if _, err := s.InstallZip(data, false); err == nil {
		t.Fatalf("expected validation error for bad manifest")
	}
	if entries, _ := os.ReadDir(s.pluginsDir); len(entries) != 0 {
		t.Fatalf("bad install left files: %v", entries)
	}
}

func TestInstallZipNoManifest(t *testing.T) {
	s := newTestService(t)
	data := makeZip(t, map[string]string{"readme.txt": "x"})
	if _, err := s.InstallZip(data, false); !errors.Is(err, ErrNoManifest) {
		t.Fatalf("expected ErrNoManifest, got %v", err)
	}
}

func TestUninstallRemovesFolderKeepsStorage(t *testing.T) {
	s := newTestService(t)
	s.InstallZip(makeZip(t, map[string]string{"manifest.json": manifestJSON("dev.x", "1.0.0"), "main.js": "//a"}), false)
	s.SetEnabled("dev.x", true)
	s.store.StorageSet("dev.x", "k", []byte(`"v"`))

	if err := s.Uninstall("dev.x"); err != nil {
		t.Fatalf("Uninstall: %v", err)
	}
	if _, err := os.Stat(filepath.Join(s.pluginsDir, "dev.x")); !os.IsNotExist(err) {
		t.Fatalf("folder must be removed")
	}
	if enabled, _, _ := s.store.State("dev.x"); enabled {
		t.Fatalf("enabled must be cleared")
	}
	if v, err := s.store.StorageGet("dev.x", "k"); err != nil || string(v) != `"v"` {
		t.Fatalf("storage must be kept, got %q err=%v", v, err)
	}
}

func TestUninstallBrokenFolder(t *testing.T) {
	s := newTestService(t)
	os.MkdirAll(filepath.Join(s.pluginsDir, "broken"), 0o755)
	os.WriteFile(filepath.Join(s.pluginsDir, "broken", "manifest.json"), []byte(`{bad`), 0o644)
	if err := s.Uninstall("broken"); err != nil {
		t.Fatalf("Uninstall broken: %v", err)
	}
	if _, err := os.Stat(filepath.Join(s.pluginsDir, "broken")); !os.IsNotExist(err) {
		t.Fatalf("broken folder must be removed")
	}
}

func TestStorageInfo(t *testing.T) {
	s := newTestService(t)
	s.store.StorageSet("dev.x", "k1", []byte(`"v"`))
	s.store.StorageSet("dev.x", "k2", []byte(`123`))
	si := s.StorageInfo("dev.x")
	if si.Keys != 2 || si.Bytes <= 0 {
		t.Fatalf("bad StorageInfo: %+v", si)
	}
}

func TestUninstallRejectsSelfDir(t *testing.T) {
	s := newTestService(t)
	os.MkdirAll(filepath.Join(s.pluginsDir, "keep"), 0o755)
	for _, bad := range []string{".", ".."} {
		if err := s.Uninstall(bad); err == nil {
			t.Fatalf("expected error for dirName %q (would wipe pluginsDir)", bad)
		}
	}
	if _, err := os.Stat(filepath.Join(s.pluginsDir, "keep")); err != nil {
		t.Fatalf("pluginsDir must be intact after rejected uninstall: %v", err)
	}
}

func TestInstallZipRejectsHugeData(t *testing.T) {
	s := newTestService(t)
	huge := make([]byte, installMaxBytes+1)
	if _, err := s.InstallZip(huge, false); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("expected ErrTooLarge for oversized archive, got %v", err)
	}
}
