package plugins

import (
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
