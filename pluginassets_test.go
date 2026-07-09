package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/tilzio/tilzio/internal/plugins"
)

// tempPluginSvc creates a plugins.Service over a temp folder with a single plugin id="p1".
func tempPluginSvc(t *testing.T, files map[string]string) *plugins.Service {
	t.Helper()
	root := t.TempDir()
	dir := filepath.Join(root, "plugins", "p1")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for name, body := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return plugins.NewService(filepath.Join(root, "plugins"), filepath.Join(root, "plugins.json"))
}

const manifestP1 = `{"id":"p1","name":"P1","version":"1.0.0","engine":"tilzio@1","entry":"main.js","contributes":{"views":[{"id":"main","title":"P1","entry":"view.html"}]}}`

func serve(h http.Handler, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

func TestPluginAsset_ServesHTMLWithCSPandBridge(t *testing.T) {
	svc := tempPluginSvc(t, map[string]string{
		"manifest.json": manifestP1,
		"view.html":     "<html><head></head><body>hi</body></html>",
	})
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(599) })
	h := NewPluginAssetHandler(svc, next)

	rec := serve(h, "/plugins/p1/view.html")
	if rec.Code != 200 {
		t.Fatalf("code = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
		t.Fatalf("content-type = %q", ct)
	}
	csp := rec.Header().Get("Content-Security-Policy")
	if !strings.Contains(csp, "script-src 'unsafe-inline'") {
		t.Fatalf("csp missing script-src 'unsafe-inline': %q", csp)
	}
	if !strings.Contains(csp, "connect-src 'none'") {
		t.Fatalf("csp should default to no network: %q", csp)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "window.host") || !strings.Contains(body, "__tsview") {
		t.Fatalf("bridge prelude not injected: %q", body)
	}
	// injected after <head>
	if strings.Index(body, "window.host") > strings.Index(body, "<body>") {
		t.Fatalf("bridge should be injected before <body>")
	}
}

func TestInjectViewBridgeHasThemeHandler(t *testing.T) {
	out := string(injectViewBridge([]byte("<html><head></head><body></body></html>")))
	for _, want := range []string{"ts:theme", "--ts-", "setProperty", "e.source!==parent"} {
		if !strings.Contains(out, want) {
			t.Fatalf("injected prelude missing %q; got: %s", want, out)
		}
	}
}

func TestPluginAsset_NonPluginPathDelegates(t *testing.T) {
	svc := tempPluginSvc(t, map[string]string{"manifest.json": manifestP1})
	delegated := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { delegated = true })
	NewPluginAssetHandler(svc, next).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/assets/app.js", nil))
	if !delegated {
		t.Fatal("non-/plugins path must delegate to next")
	}
}

func TestPluginAsset_TraversalAndMissing404(t *testing.T) {
	svc := tempPluginSvc(t, map[string]string{"manifest.json": manifestP1})
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(599) })
	h := NewPluginAssetHandler(svc, next)
	if rec := serve(h, "/plugins/p1/../../secret"); rec.Code != 404 {
		t.Fatalf("traversal code = %d, want 404", rec.Code)
	}
	if rec := serve(h, "/plugins/p1/nope.js"); rec.Code != 404 {
		t.Fatalf("missing code = %d, want 404", rec.Code)
	}
}

const manifestNet = `{"id":"pnet","name":"Net","version":"1.0.0","engine":"tilzio@1","entry":"main.js","permissions":["network"],"contributes":{"views":[{"id":"main","title":"N","entry":"view.html"}]}}`

func TestPluginAsset_NetworkPermissionRelaxesCSP(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "plugins", "pnet")
	if err := os.MkdirAll(dir, 0o755); err != nil { t.Fatal(err) }
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), []byte(manifestNet), 0o644); err != nil { t.Fatal(err) }
	if err := os.WriteFile(filepath.Join(dir, "view.html"), []byte("<html><head></head><body></body></html>"), 0o644); err != nil { t.Fatal(err) }
	svc := plugins.NewService(filepath.Join(root, "plugins"), filepath.Join(root, "plugins.json"))
	h := NewPluginAssetHandler(svc, http.NotFoundHandler())
	csp := serve(h, "/plugins/pnet/view.html").Header().Get("Content-Security-Policy")
	if !strings.Contains(csp, "connect-src https:") {
		t.Fatalf("network plugin should allow connect-src https: — %q", csp)
	}
	if strings.Contains(csp, "script-src 'unsafe-inline' https:") {
		t.Fatalf("script-src must NOT be widened to https: — %q", csp)
	}
}

func TestPluginAsset_CSSContentType(t *testing.T) {
	svc := tempPluginSvc(t, map[string]string{"manifest.json": manifestP1, "s.css": "body{}"})
	h := NewPluginAssetHandler(svc, http.NotFoundHandler())
	rec := serve(h, "/plugins/p1/s.css")
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/css") {
		t.Fatalf("css content-type = %q", ct)
	}
	if strings.Contains(rec.Body.String(), "window.host") {
		t.Fatal("bridge must NOT be injected into non-html")
	}
}
