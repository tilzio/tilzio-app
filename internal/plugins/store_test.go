package plugins

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestStoreSetEnabledRoundTrip(t *testing.T) {
	p := filepath.Join(t.TempDir(), "plugins.json")
	s := NewPluginStore(p)
	if err := s.SetEnabled("dev.term.git", true, []string{"exec", "state:read"}); err != nil {
		t.Fatal(err)
	}
	// Fresh store over the same file = reload from disk.
	s2 := NewPluginStore(p)
	enabled, perms, ok := s2.State("dev.term.git")
	if !ok || !enabled {
		t.Fatalf("want enabled record, got ok=%v enabled=%v", ok, enabled)
	}
	if len(perms) != 2 || perms[0] != "exec" {
		t.Fatalf("granted perms not persisted: %v", perms)
	}
}

func TestStoreStateMissing(t *testing.T) {
	s := NewPluginStore(filepath.Join(t.TempDir(), "plugins.json"))
	if _, _, ok := s.State("nope"); ok {
		t.Fatal("expected ok=false for unknown id and missing file")
	}
}

func TestStoreDisableKeepsGranted(t *testing.T) {
	p := filepath.Join(t.TempDir(), "plugins.json")
	s := NewPluginStore(p)
	_ = s.SetEnabled("a", true, []string{"exec"})
	_ = s.SetEnabled("a", false, nil)
	enabled, perms, ok := s.State("a")
	if !ok || enabled {
		t.Fatalf("want disabled record, got ok=%v enabled=%v", ok, enabled)
	}
	if len(perms) != 1 || perms[0] != "exec" {
		t.Fatalf("granted perms should remain as history: %v", perms)
	}
}

func TestStoreCorruptBacksUp(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "plugins.json")
	if err := os.WriteFile(p, []byte("{not json"), 0o644); err != nil {
		t.Fatal(err)
	}
	s := NewPluginStore(p)
	if _, _, ok := s.State("anything"); ok {
		t.Fatal("corrupt file should yield empty registry")
	}
	matches, _ := filepath.Glob(p + ".corrupt-*")
	if len(matches) == 0 {
		t.Fatal("expected a .corrupt-* backup")
	}
}

// An EXISTING but unreadable plugins.json (permissions, I/O error) must not be
// clobbered: reads fall back to an empty registry, but save() refuses until a
// later load succeeds — otherwise the next mutation would persist an empty file
// and silently lose every plugin's state.
func TestStoreUnreadableFileRefusesSave(t *testing.T) {
	if os.Getuid() == 0 {
		t.Skip("chmod 0000 does not block reads for root")
	}
	dir := t.TempDir()
	p := filepath.Join(dir, "plugins.json")
	body := `{"plugins":{"a":{"enabled":true}}}`
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(p, 0o000); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(p, 0o644) })

	s := NewPluginStore(p)
	// Reads degrade to an empty registry (the store always answers)…
	if _, _, ok := s.State("a"); ok {
		t.Fatal("unreadable file should read as an empty registry")
	}
	// …but mutations must refuse rather than persist that emptiness.
	if err := s.SetEnabled("b", true, nil); err == nil {
		t.Fatal("save over an unreadable store must return an error")
	}
	if err := s.StorageSet("b", "k", json.RawMessage(`1`)); err == nil {
		t.Fatal("StorageSet over an unreadable store must return an error")
	}

	// Original bytes intact after the failed mutations.
	if err := os.Chmod(p, 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != body {
		t.Fatalf("store clobbered: %q", got)
	}
	// Once readable again, the failure is not sticky: mutations work and merge
	// with the preserved state.
	if err := s.SetEnabled("b", true, nil); err != nil {
		t.Fatalf("save after recovery: %v", err)
	}
	enabled, _, ok := s.State("a")
	if !ok || !enabled {
		t.Fatalf("pre-existing record lost: ok=%v enabled=%v", ok, enabled)
	}
}

func TestStoreNullPluginsField(t *testing.T) {
	p := filepath.Join(t.TempDir(), "plugins.json")
	if err := os.WriteFile(p, []byte(`{"plugins":null}`), 0o644); err != nil {
		t.Fatal(err)
	}
	s := NewPluginStore(p)
	if _, _, ok := s.State("x"); ok {
		t.Fatal("null plugins should yield empty registry")
	}
	// A subsequent SetEnabled must not panic or error on the normalized map.
	if err := s.SetEnabled("x", true, nil); err != nil {
		t.Fatal(err)
	}
}

func TestStoreStorageClear(t *testing.T) {
	p := filepath.Join(t.TempDir(), "plugins.json")
	s := NewPluginStore(p)
	if err := s.SetEnabled("a", true, []string{"exec"}); err != nil {
		t.Fatal(err)
	}
	if err := s.StorageSet("a", "k", json.RawMessage(`{"n":1}`)); err != nil {
		t.Fatal(err)
	}
	if err := s.StorageClear("a"); err != nil {
		t.Fatal(err)
	}
	if info := s.StorageInfo("a"); info.Keys != 0 || info.Bytes != 0 {
		t.Fatalf("storage not cleared: %+v", info)
	}
	// Enabled flag + granted permissions must survive the reset.
	enabled, perms, ok := s.State("a")
	if !ok || !enabled {
		t.Fatalf("record/enabled lost: ok=%v enabled=%v", ok, enabled)
	}
	if len(perms) != 1 || perms[0] != "exec" {
		t.Fatalf("granted perms lost: %v", perms)
	}
}

func TestStoreStorageClearLeavesOthers(t *testing.T) {
	p := filepath.Join(t.TempDir(), "plugins.json")
	s := NewPluginStore(p)
	_ = s.StorageSet("a", "k", json.RawMessage(`1`))
	_ = s.StorageSet("b", "k", json.RawMessage(`2`))
	if err := s.StorageClear("a"); err != nil {
		t.Fatal(err)
	}
	if s.StorageInfo("a").Keys != 0 {
		t.Fatal("a should be cleared")
	}
	if s.StorageInfo("b").Keys != 1 {
		t.Fatal("b must be untouched")
	}
}

func TestStoreStorageClearMissing(t *testing.T) {
	s := NewPluginStore(filepath.Join(t.TempDir(), "plugins.json"))
	if err := s.StorageClear("nope"); err != nil {
		t.Fatalf("missing id should be a no-op, got %v", err)
	}
}

func TestStoreStorageClearNoStorageRecord(t *testing.T) {
	p := filepath.Join(t.TempDir(), "plugins.json")
	s := NewPluginStore(p)
	if err := s.SetEnabled("a", true, []string{"exec"}); err != nil {
		t.Fatal(err)
	}
	// Record exists but has no storage → clear is a no-op; enabled/perms untouched.
	if err := s.StorageClear("a"); err != nil {
		t.Fatalf("no-op clear errored: %v", err)
	}
	enabled, perms, ok := s.State("a")
	if !ok || !enabled || len(perms) != 1 || perms[0] != "exec" {
		t.Fatalf("no-op clear changed the record: ok=%v enabled=%v perms=%v", ok, enabled, perms)
	}
}

func TestStoreAutoUpdateDefaultTrue(t *testing.T) {
	s := NewPluginStore(filepath.Join(t.TempDir(), "plugins.json"))
	if !s.AutoUpdate() {
		t.Fatal("missing file must default to autoUpdate=true")
	}
}

func TestStoreAutoUpdateLegacyFileDefaultsTrue(t *testing.T) {
	path := filepath.Join(t.TempDir(), "plugins.json")
	// A pre-store file has plugins but no autoUpdate field.
	if err := os.WriteFile(path, []byte(`{"plugins":{"a":{"enabled":true}}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	s := NewPluginStore(path)
	if !s.AutoUpdate() {
		t.Fatal("file without the field must default to autoUpdate=true")
	}
}

func TestStoreSetAutoUpdateRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "plugins.json")
	s := NewPluginStore(path)
	if err := s.SetAutoUpdate(false); err != nil {
		t.Fatalf("SetAutoUpdate: %v", err)
	}
	if s.AutoUpdate() {
		t.Fatal("expected false after SetAutoUpdate(false)")
	}
	// A fresh store over the same file sees the persisted value.
	if NewPluginStore(path).AutoUpdate() {
		t.Fatal("persisted false must survive reload")
	}
	if err := s.SetAutoUpdate(true); err != nil {
		t.Fatal(err)
	}
	if !s.AutoUpdate() {
		t.Fatal("expected true after SetAutoUpdate(true)")
	}
}

func TestStoreSetAutoUpdateKeepsPlugins(t *testing.T) {
	path := filepath.Join(t.TempDir(), "plugins.json")
	s := NewPluginStore(path)
	if err := s.SetEnabled("a", true, []string{"exec"}); err != nil {
		t.Fatal(err)
	}
	if err := s.SetAutoUpdate(false); err != nil {
		t.Fatal(err)
	}
	enabled, perms, ok := s.State("a")
	if !ok || !enabled || len(perms) != 1 || perms[0] != "exec" {
		t.Fatalf("plugin state lost: ok=%v enabled=%v perms=%v", ok, enabled, perms)
	}
}
