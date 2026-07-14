package plugins

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

// newTestMarket builds a Market over a fresh Service with a temp cache file.
func newTestMarket(t *testing.T, baseURL string) *Market {
	t.Helper()
	dir := t.TempDir()
	svc := NewService(filepath.Join(dir, "plugins"), filepath.Join(dir, "plugins.json"))
	return NewMarket(svc, filepath.Join(dir, "store-cache.json"), baseURL, func(string, any) {})
}

// catalogJSON renders a /v1/registry payload for the fake registry.
func catalogJSON(t *testing.T, entries []StoreEntry) []byte {
	t.Helper()
	b, err := json.Marshal(map[string]any{"schemaVersion": 1, "extensions": entries})
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func testEntry(id, version string) StoreEntry {
	return StoreEntry{
		ID: id, Name: "X", Description: "demo extension", Version: version,
		Engine: "tilzio@1", Permissions: []string{"state:read"}, Exec: nil,
		Size: 3, SHA256: "0000", Publisher: "tilzio", UpdatedAt: "2026-07-14T00:00:00Z",
	}
}

func TestCheckRegistryURL(t *testing.T) {
	cases := []struct {
		url string
		ok  bool
	}{
		{"https://registry.tilzio.example", true},
		{"http://localhost:8080", true},
		{"http://127.0.0.1:8080", true},
		{"http://[::1]:8080", true},
		{"http://evil.example", false},
		{"ftp://localhost", false},
		{"://bad", false},
	}
	for _, c := range cases {
		err := checkRegistryURL(c.url)
		if c.ok && err != nil {
			t.Errorf("%s: unexpected error %v", c.url, err)
		}
		if !c.ok && !errors.Is(err, ErrInsecureURL) {
			t.Errorf("%s: want ErrInsecureURL, got %v", c.url, err)
		}
	}
}

func TestRegistryBaseURL(t *testing.T) {
	t.Setenv("TILZIO_REGISTRY_URL", "")
	if got := RegistryBaseURL(); got != DefaultRegistryURL {
		t.Fatalf("default: got %q", got)
	}
	t.Setenv("TILZIO_REGISTRY_URL", "http://localhost:8080/")
	if got := RegistryBaseURL(); got != "http://localhost:8080" {
		t.Fatalf("override: got %q (trailing slash must be trimmed)", got)
	}
	t.Setenv("TILZIO_REGISTRY_URL", "http://evil.example")
	if got := RegistryBaseURL(); got != DefaultRegistryURL {
		t.Fatalf("invalid override must fall back to default, got %q", got)
	}
}

// fakeRegistry serves a catalog with an ETag and counts requests.
func fakeRegistry(t *testing.T, entries []StoreEntry, etag string, hits *atomic.Int64) *httptest.Server {
	t.Helper()
	body := catalogJSON(t, entries)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/registry" {
			http.NotFound(w, r)
			return
		}
		hits.Add(1)
		if etag != "" && r.Header.Get("If-None-Match") == etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		if etag != "" {
			w.Header().Set("ETag", etag)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestStoreCatalogFetchAndCacheWrite(t *testing.T) {
	var hits atomic.Int64
	srv := fakeRegistry(t, []StoreEntry{testEntry("io.tilzio.ai-limits", "1.2.0")}, `"e1"`, &hits)
	m := newTestMarket(t, srv.URL)
	cat, err := m.StoreCatalog(false)
	if err != nil {
		t.Fatalf("StoreCatalog: %v", err)
	}
	if cat.Stale || len(cat.Extensions) != 1 || cat.Extensions[0].ID != "io.tilzio.ai-limits" {
		t.Fatalf("bad catalog: %+v", cat)
	}
	if cat.FetchedAt.IsZero() {
		t.Fatal("FetchedAt must be set")
	}
	if _, err := os.Stat(m.cachePath); err != nil {
		t.Fatalf("cache file not written: %v", err)
	}
}

func TestStoreCatalogTTLServesCacheWithoutRequest(t *testing.T) {
	var hits atomic.Int64
	srv := fakeRegistry(t, []StoreEntry{testEntry("a", "1.0.0")}, `"e1"`, &hits)
	m := newTestMarket(t, srv.URL)
	if _, err := m.StoreCatalog(false); err != nil {
		t.Fatal(err)
	}
	if _, err := m.StoreCatalog(false); err != nil {
		t.Fatal(err)
	}
	if hits.Load() != 1 {
		t.Fatalf("second call within TTL must not hit the network, hits=%d", hits.Load())
	}
}

func TestStoreCatalogForceBypassesTTL(t *testing.T) {
	var hits atomic.Int64
	srv := fakeRegistry(t, []StoreEntry{testEntry("a", "1.0.0")}, `"e1"`, &hits)
	m := newTestMarket(t, srv.URL)
	if _, err := m.StoreCatalog(false); err != nil {
		t.Fatal(err)
	}
	if _, err := m.StoreCatalog(true); err != nil {
		t.Fatal(err)
	}
	if hits.Load() != 2 {
		t.Fatalf("force must revalidate, hits=%d", hits.Load())
	}
}

func TestStoreCatalog304KeepsEntries(t *testing.T) {
	var hits atomic.Int64
	srv := fakeRegistry(t, []StoreEntry{testEntry("a", "1.0.0")}, `"e1"`, &hits)
	m := newTestMarket(t, srv.URL)
	if _, err := m.StoreCatalog(false); err != nil {
		t.Fatal(err)
	}
	// Expire the TTL: the next call revalidates with If-None-Match → 304.
	m.now = func() time.Time { return time.Now().Add(2 * catalogTTL) }
	cat, err := m.StoreCatalog(false)
	if err != nil {
		t.Fatal(err)
	}
	if cat.Stale || len(cat.Extensions) != 1 {
		t.Fatalf("304 must serve cached entries fresh: %+v", cat)
	}
	if hits.Load() != 2 {
		t.Fatalf("expected a revalidation request, hits=%d", hits.Load())
	}
}

func TestStoreCatalogStaleOnNetworkError(t *testing.T) {
	var hits atomic.Int64
	srv := fakeRegistry(t, []StoreEntry{testEntry("a", "1.0.0")}, `"e1"`, &hits)
	m := newTestMarket(t, srv.URL)
	if _, err := m.StoreCatalog(false); err != nil {
		t.Fatal(err)
	}
	srv.Close()
	m.now = func() time.Time { return time.Now().Add(2 * catalogTTL) }
	cat, err := m.StoreCatalog(false)
	if err != nil {
		t.Fatalf("cache fallback must not error: %v", err)
	}
	if !cat.Stale || len(cat.Extensions) != 1 {
		t.Fatalf("want stale catalog from cache: %+v", cat)
	}
}

func TestStoreCatalogErrorWithoutCache(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	srv.Close()
	m := newTestMarket(t, srv.URL)
	if _, err := m.StoreCatalog(false); err == nil {
		t.Fatal("no cache + no network must error")
	}
}

func TestStoreDetailFetch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/extensions/io.tilzio.ai-limits" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"id":"io.tilzio.ai-limits","name":"AI Limits","description":"d",
			"version":"1.2.0","engine":"tilzio@1","permissions":["exec"],"exec":["claude"],
			"size":3,"sha256":"aa","publisher":"tilzio","updatedAt":"2026-07-14T00:00:00Z",
			"readme":"# AI Limits","versions":[{"version":"1.2.0","sha256":"aa","size":3,"createdAt":"2026-07-14T00:00:00Z"}]}}`))
	}))
	t.Cleanup(srv.Close)
	m := newTestMarket(t, srv.URL)
	d, err := m.StoreDetail("io.tilzio.ai-limits")
	if err != nil {
		t.Fatalf("StoreDetail: %v", err)
	}
	if d.ID != "io.tilzio.ai-limits" || d.Readme != "# AI Limits" || len(d.Versions) != 1 {
		t.Fatalf("bad detail: %+v", d)
	}
}

func TestStoreDetailNotFound(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	t.Cleanup(srv.Close)
	m := newTestMarket(t, srv.URL)
	if _, err := m.StoreDetail("nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}

func TestStoreDetailNetworkError(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	srv.Close()
	m := newTestMarket(t, srv.URL)
	if _, err := m.StoreDetail("x"); !errors.Is(err, ErrDownload) {
		t.Fatalf("want ErrDownload, got %v", err)
	}
}

// storeServer is a fake registry serving a catalog with one entry and its zip.
// sha controls the advertised sha256 ("" = correct).
func storeServer(t *testing.T, id, version string, zipData []byte, sha string) (*httptest.Server, StoreEntry) {
	t.Helper()
	if sha == "" {
		sum := sha256.Sum256(zipData)
		sha = hex.EncodeToString(sum[:])
	}
	entry := testEntry(id, version)
	entry.SHA256 = sha
	entry.Size = int64(len(zipData))
	body := catalogJSON(t, []StoreEntry{entry})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/registry":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write(body)
		case "/v1/extensions/" + id + "/" + version + "/download":
			w.Header().Set("Content-Type", "application/zip")
			_, _ = w.Write(zipData)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	return srv, entry
}

func TestStoreInstallHappyPath(t *testing.T) {
	zipData := makeZip(t, map[string]string{"manifest.json": manifestJSON("dev.s", "1.0.0"), "main.js": "//s"})
	srv, _ := storeServer(t, "dev.s", "1.0.0", zipData, "")
	m := newTestMarket(t, srv.URL)
	res, err := m.StoreInstall("dev.s")
	if err != nil {
		t.Fatalf("StoreInstall: %v", err)
	}
	if res.Status != "installed" || res.Info == nil || res.Info.Manifest.ID != "dev.s" {
		t.Fatalf("bad result: %+v", res)
	}
	if _, err := os.Stat(filepath.Join(m.svc.pluginsDir, "dev.s", "main.js")); err != nil {
		t.Fatalf("plugin not on disk: %v", err)
	}
}

func TestStoreInstallOverwritesKeepingState(t *testing.T) {
	zipV2 := makeZip(t, map[string]string{"manifest.json": manifestJSON("dev.s", "2.0.0"), "main.js": "//v2"})
	srv, _ := storeServer(t, "dev.s", "2.0.0", zipV2, "")
	m := newTestMarket(t, srv.URL)
	// Pre-install v1 and enable it.
	v1 := makeZip(t, map[string]string{"manifest.json": manifestJSON("dev.s", "1.0.0"), "main.js": "//v1"})
	if _, err := m.svc.InstallZip(v1, false); err != nil {
		t.Fatal(err)
	}
	if err := m.svc.SetEnabled("dev.s", true); err != nil {
		t.Fatal(err)
	}
	res, err := m.StoreInstall("dev.s")
	if err != nil {
		t.Fatalf("StoreInstall: %v", err)
	}
	if res.Status != "installed" || res.Info.Manifest.Version != "2.0.0" {
		t.Fatalf("bad result: %+v", res)
	}
	if !res.Info.Enabled {
		t.Fatal("enabled state must survive a store update")
	}
}

func TestStoreInstallChecksumMismatch(t *testing.T) {
	zipData := makeZip(t, map[string]string{"manifest.json": manifestJSON("dev.s", "1.0.0"), "main.js": "//s"})
	srv, _ := storeServer(t, "dev.s", "1.0.0", zipData, "deadbeef")
	m := newTestMarket(t, srv.URL)
	if _, err := m.StoreInstall("dev.s"); !errors.Is(err, ErrChecksum) {
		t.Fatalf("want ErrChecksum, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(m.svc.pluginsDir, "dev.s")); !os.IsNotExist(err) {
		t.Fatal("nothing must be installed on checksum mismatch")
	}
}

func TestStoreInstallUnknownID(t *testing.T) {
	srv := fakeRegistry(t, []StoreEntry{testEntry("a", "1.0.0")}, "", new(atomic.Int64))
	m := newTestMarket(t, srv.URL)
	if _, err := m.StoreInstall("missing"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}
