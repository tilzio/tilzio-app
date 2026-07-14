package main

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"

	"github.com/tilzio/tilzio/internal/plugins"
)

// newTestPluginsAppWithMarket builds the binding layer over a temp Service and
// a Market pointed at baseURL (use a dead URL when the test never goes online).
func newTestPluginsAppWithMarket(t *testing.T, baseURL string) *PluginsApp {
	t.Helper()
	dir := t.TempDir()
	svc := plugins.NewService(filepath.Join(dir, "plugins"), filepath.Join(dir, "plugins.json"))
	market := plugins.NewMarket(svc, filepath.Join(dir, "store-cache.json"), baseURL, func(string, any) {})
	return NewPluginsApp(svc, market)
}

func TestStoreAutoUpdateBindingRoundTrip(t *testing.T) {
	app := newTestPluginsAppWithMarket(t, "http://127.0.0.1:1")
	if !app.StoreAutoUpdate() {
		t.Fatal("default must be true")
	}
	if err := app.StoreSetAutoUpdate(false); err != nil {
		t.Fatal(err)
	}
	if app.StoreAutoUpdate() {
		t.Fatal("expected false after StoreSetAutoUpdate(false)")
	}
}

func TestPluginsAppReadFileBase64(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "plugins", "git")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"),
		[]byte(`{"id":"git","name":"G","version":"1","engine":"tilzio@1","entry":"main.js"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "main.js"), []byte("CODE"), 0o644); err != nil {
		t.Fatal(err)
	}
	svc := plugins.NewService(filepath.Join(root, "plugins"), filepath.Join(root, "plugins.json"))
	app := NewPluginsApp(svc, plugins.NewMarket(svc, filepath.Join(root, "store-cache.json"), "http://127.0.0.1:1", func(string, any) {}))
	enc, err := app.PluginReadFile("git", "main.js")
	if err != nil {
		t.Fatal(err)
	}
	dec, err := base64.StdEncoding.DecodeString(enc)
	if err != nil || string(dec) != "CODE" {
		t.Fatalf("decoded=%q err=%v", dec, err)
	}
}

func TestPluginInstallZipAndUninstallBinding(t *testing.T) {
	dir := t.TempDir()
	svc := plugins.NewService(filepath.Join(dir, "plugins"), filepath.Join(dir, "plugins.json"))
	app := NewPluginsApp(svc, plugins.NewMarket(svc, filepath.Join(dir, "store-cache.json"), "http://127.0.0.1:1", func(string, any) {}))

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	w, _ := zw.Create("manifest.json")
	w.Write([]byte(`{"id":"dev.x","name":"X","version":"1.0.0","engine":"tilzio@1","entry":"main.js"}`))
	w2, _ := zw.Create("main.js")
	w2.Write([]byte("//x"))
	zw.Close()
	b64 := base64.StdEncoding.EncodeToString(buf.Bytes())

	res, err := app.PluginInstallZip(b64, false)
	if err != nil || res.Status != "installed" {
		t.Fatalf("install binding: %+v err=%v", res, err)
	}
	if list := app.PluginsList(); len(list) != 1 || list[0].Manifest.ID != "dev.x" {
		t.Fatalf("plugin not listed after install: %+v", list)
	}
	if err := app.PluginUninstall("dev.x"); err != nil {
		t.Fatalf("uninstall binding: %v", err)
	}
	if list := app.PluginsList(); len(list) != 0 {
		t.Fatalf("plugin still listed after uninstall: %+v", list)
	}
}

func TestPluginsAppExec(t *testing.T) {
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
	svc := plugins.NewService(filepath.Join(root, "plugins"), filepath.Join(root, "plugins.json"))
	app := NewPluginsApp(svc, plugins.NewMarket(svc, filepath.Join(root, "store-cache.json"), "http://127.0.0.1:1", func(string, any) {}))

	res, err := app.PluginExec("git", "echo", []string{"hi"}, "")
	if err != nil || res.Stdout != "hi\n" || res.Code != 0 {
		t.Fatalf("res=%+v err=%v", res, err)
	}
	if _, err := app.PluginExec("git", "ls", nil, ""); err == nil {
		t.Fatal("expected reject for non-allow-list binary")
	}
}
