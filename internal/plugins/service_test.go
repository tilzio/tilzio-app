package plugins

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestServiceListAndEnable(t *testing.T) {
	root := t.TempDir()
	pluginsDir := filepath.Join(root, "plugins")
	writePlugin(t, pluginsDir, "git",
		`{"id":"dev.term.git","name":"Git","version":"1","engine":"tilzio@1","entry":"main.js","permissions":["exec"]}`)
	svc := NewService(pluginsDir, filepath.Join(root, "plugins.json"))

	list := svc.List()
	if len(list) != 1 || list[0].Manifest == nil || list[0].Enabled {
		t.Fatalf("unexpected list: %+v", list)
	}
	if err := svc.SetEnabled("dev.term.git", true); err != nil {
		t.Fatal(err)
	}
	list = svc.List()
	if !list[0].Enabled || len(list[0].Permissions) != 1 || list[0].Permissions[0] != "exec" {
		t.Fatalf("enable not reflected: %+v", list[0])
	}
}

func TestServiceSetEnabledUnknown(t *testing.T) {
	root := t.TempDir()
	svc := NewService(filepath.Join(root, "plugins"), filepath.Join(root, "plugins.json"))
	if err := svc.SetEnabled("nope", true); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}

func TestServiceReadFile(t *testing.T) {
	root := t.TempDir()
	pluginsDir := filepath.Join(root, "plugins")
	writePlugin(t, pluginsDir, "git",
		`{"id":"dev.term.git","name":"Git","version":"1","engine":"tilzio@1","entry":"main.js"}`)
	if err := os.WriteFile(filepath.Join(pluginsDir, "git", "main.js"), []byte("MAIN"), 0o644); err != nil {
		t.Fatal(err)
	}
	svc := NewService(pluginsDir, filepath.Join(root, "plugins.json"))
	data, err := svc.ReadFile("dev.term.git", "main.js")
	if err != nil || string(data) != "MAIN" {
		t.Fatalf("data=%q err=%v", data, err)
	}
	if _, err := svc.ReadFile("unknown", "main.js"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound for unknown id, got %v", err)
	}
}

func TestServiceStorage(t *testing.T) {
	root := t.TempDir()
	svc := NewService(filepath.Join(root, "plugins"), filepath.Join(root, "plugins.json"))
	if err := svc.StorageSet("dev.term.git", "k", json.RawMessage(`{"n":1}`)); err != nil {
		t.Fatal(err)
	}
	v, err := svc.StorageGet("dev.term.git", "k")
	if err != nil || string(v) != `{"n":1}` {
		t.Fatalf("v=%s err=%v", v, err)
	}
}

func TestServiceBrokenPluginListedNotEnabled(t *testing.T) {
	root := t.TempDir()
	pluginsDir := filepath.Join(root, "plugins")
	writePlugin(t, pluginsDir, "broken", `{not json`)
	svc := NewService(pluginsDir, filepath.Join(root, "plugins.json"))

	list := svc.List()
	if len(list) != 1 || list[0].Err == "" || list[0].Enabled {
		t.Fatalf("broken plugin should be listed with Err and not enabled: %+v", list)
	}
	// A broken plugin has no usable id; enabling by its folder name must fail.
	if err := svc.SetEnabled("broken", true); !errors.Is(err, ErrNotFound) {
		t.Fatalf("enabling a broken plugin should be ErrNotFound, got %v", err)
	}
}

func TestServiceExecAllowList(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "plugins", "git")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"),
		[]byte(`{"id":"git","name":"G","version":"1","engine":"tilzio@1","entry":"main.js","exec":["echo"]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "main.js"), []byte("//"), 0o644); err != nil {
		t.Fatal(err)
	}
	svc := NewService(filepath.Join(root, "plugins"), filepath.Join(root, "plugins.json"))

	// allowed binary runs
	res, err := svc.Exec("git", "echo", []string{"hi"}, "")
	if err != nil || res.Stdout != "hi\n" {
		t.Fatalf("allowed: res=%+v err=%v", res, err)
	}
	// binary not in allow-list → rejected
	if _, err := svc.Exec("git", "ls", nil, ""); !errors.Is(err, ErrExecNotAllowed) {
		t.Fatalf("not-allowed: err=%v", err)
	}
	// exact match: "./echo" must NOT pass as "echo"
	if _, err := svc.Exec("git", "./echo", nil, ""); !errors.Is(err, ErrExecNotAllowed) {
		t.Fatalf("path-variant: err=%v", err)
	}
	// strict match: case and whitespace variants must NOT pass as "echo"
	if _, err := svc.Exec("git", "Echo", nil, ""); !errors.Is(err, ErrExecNotAllowed) {
		t.Fatalf("case-variant: err=%v", err)
	}
	if _, err := svc.Exec("git", " echo", nil, ""); !errors.Is(err, ErrExecNotAllowed) {
		t.Fatalf("space-variant: err=%v", err)
	}
	// unknown plugin → ErrNotFound
	if _, err := svc.Exec("nope", "echo", nil, ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown: err=%v", err)
	}
}

func TestServiceExecDuplicateId(t *testing.T) {
	root := t.TempDir()
	pluginsDir := filepath.Join(root, "plugins")
	// Two folders with the same id "git", different allow-lists. Lexicographically "aaa" < "zzz",
	// so Discover keeps "aaa" (exec:["echo"]) in the registry; "zzz" (exec:["ls"]) is
	// a duplicate, rejected. The boundary must apply the allow-list of the WINNING folder.
	for _, p := range []struct{ dir, exec string }{
		{"aaa", `["echo"]`},
		{"zzz", `["ls"]`},
	} {
		d := filepath.Join(pluginsDir, p.dir)
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(d, "manifest.json"),
			[]byte(`{"id":"git","name":"G","version":"1","engine":"tilzio@1","entry":"main.js","exec":`+p.exec+`}`), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(d, "main.js"), []byte("//"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	svc := NewService(pluginsDir, filepath.Join(root, "plugins.json"))

	// "aaa" won with exec:["echo"] → echo is allowed.
	if _, err := svc.Exec("git", "echo", []string{"x"}, ""); err != nil {
		t.Fatalf("winner allow-list (echo) should run: err=%v", err)
	}
	// The rejected "zzz" list (["ls"]) is NOT applied → ls is rejected.
	if _, err := svc.Exec("git", "ls", nil, ""); !errors.Is(err, ErrExecNotAllowed) {
		t.Fatalf("loser allow-list (ls) must NOT apply: err=%v", err)
	}
}

// Uninstalling a DUPLICATE-id folder must not wipe the surviving (canonical)
// plugin's store record: the store is only cleaned when the removed dir is the
// one Discover resolves for the id.
func TestUninstallDuplicateDirKeepsCanonicalStoreEntry(t *testing.T) {
	root := t.TempDir()
	pluginsDir := filepath.Join(root, "plugins")
	manifest := `{"id":"git","name":"G","version":"1","engine":"tilzio@1","entry":"main.js"}`
	// Lexicographic scan order: "aaa" wins the id, "zzz" is the duplicate.
	writePlugin(t, pluginsDir, "aaa", manifest)
	writePlugin(t, pluginsDir, "zzz", manifest)
	svc := NewService(pluginsDir, filepath.Join(root, "plugins.json"))
	if err := svc.SetEnabled("git", true); err != nil {
		t.Fatal(err)
	}

	// Removing the non-canonical duplicate keeps the canonical record intact.
	if err := svc.Uninstall("zzz"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(pluginsDir, "zzz")); !os.IsNotExist(err) {
		t.Fatalf("duplicate folder should be removed, stat err=%v", err)
	}
	enabled, _, ok := svc.store.State("git")
	if !ok || !enabled {
		t.Fatalf("canonical plugin's store record wiped by duplicate uninstall: ok=%v enabled=%v", ok, enabled)
	}

	// Removing the canonical folder still cleans the record (keepStorage path).
	if err := svc.Uninstall("aaa"); err != nil {
		t.Fatal(err)
	}
	if enabled, _, ok := svc.store.State("git"); ok && enabled {
		t.Fatalf("canonical uninstall should clear the enabled record, got ok=%v enabled=%v", ok, enabled)
	}
}

func TestServiceStorageClear(t *testing.T) {
	root := t.TempDir()
	svc := NewService(filepath.Join(root, "plugins"), filepath.Join(root, "plugins.json"))
	if err := svc.StorageSet("dev.term.git", "k", json.RawMessage(`{"n":1}`)); err != nil {
		t.Fatal(err)
	}
	if got := svc.StorageInfo("dev.term.git"); got.Keys != 1 {
		t.Fatalf("setup expected 1 key, got %+v", got)
	}
	if err := svc.StorageClear("dev.term.git"); err != nil {
		t.Fatal(err)
	}
	if got := svc.StorageInfo("dev.term.git"); got.Keys != 0 || got.Bytes != 0 {
		t.Fatalf("storage not cleared via service: %+v", got)
	}
}

func TestServiceAutoUpdatePassthrough(t *testing.T) {
	s := newTestService(t)
	if !s.AutoUpdate() {
		t.Fatal("default must be true")
	}
	if err := s.SetAutoUpdate(false); err != nil {
		t.Fatal(err)
	}
	if s.AutoUpdate() {
		t.Fatal("expected false")
	}
}
