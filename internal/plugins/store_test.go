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
