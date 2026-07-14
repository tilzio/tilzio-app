package plugins

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// DefaultRegistryURL is the production registry endpoint (stage 3 swaps in the
// real domain). Override with TILZIO_REGISTRY_URL; non-localhost must be https.
const DefaultRegistryURL = "https://registry.tilzio.example"

const (
	catalogTTL        = time.Hour        // client-side freshness window (server rate limits)
	marketHTTPTimeout = 30 * time.Second // per-request cap, mirrors installDownloadTO
	catalogMaxBytes   = 8 * 1024 * 1024  // JSON responses (catalog / detail)
)

// checkRegistryURL enforces https for any non-loopback registry; plain http is
// allowed only for localhost development registries (spec §5.1).
func checkRegistryURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInsecureURL, err)
	}
	switch u.Scheme {
	case "https":
		return nil
	case "http":
		host := u.Hostname()
		if host == "localhost" || host == "127.0.0.1" || host == "::1" {
			return nil
		}
		return fmt.Errorf("%w: http is allowed only for localhost, got %q", ErrInsecureURL, host)
	default:
		return fmt.Errorf("%w: unsupported scheme %q", ErrInsecureURL, u.Scheme)
	}
}

// RegistryBaseURL resolves the registry base URL: TILZIO_REGISTRY_URL when set
// and valid, otherwise DefaultRegistryURL. An invalid override is logged and
// ignored — the app must still start with a working store.
func RegistryBaseURL() string {
	if v := os.Getenv("TILZIO_REGISTRY_URL"); v != "" {
		if err := checkRegistryURL(v); err != nil {
			log.Printf("plugins: ignoring TILZIO_REGISTRY_URL: %v", err)
			return DefaultRegistryURL
		}
		return strings.TrimRight(v, "/")
	}
	return DefaultRegistryURL
}

// StoreEntry mirrors the registry's EntrySummary (API v1) — everything the
// storefront and the auto-update permission gate need without the zip.
type StoreEntry struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Version     string   `json:"version"`
	Engine      string   `json:"engine"`
	Permissions []string `json:"permissions"`
	Exec        []string `json:"exec"`
	Size        int64    `json:"size"`
	SHA256      string   `json:"sha256"`
	Publisher   string   `json:"publisher"`
	Homepage    string   `json:"homepage,omitempty"`
	UpdatedAt   string   `json:"updatedAt"`
}

// Catalog is what the Store tab renders. Stale means the registry was
// unreachable and Extensions came from the on-disk cache (spec §7).
type Catalog struct {
	Extensions []StoreEntry `json:"extensions"`
	Stale      bool         `json:"stale"`
	FetchedAt  time.Time    `json:"fetchedAt"`
}

// storeCache is the on-disk catalog cache (dataDir/store-cache.json).
type storeCache struct {
	ETag       string       `json:"etag"`
	FetchedAt  time.Time    `json:"fetchedAt"`
	Extensions []StoreEntry `json:"extensions"`
}

// registryPayload is the GET /v1/registry response shape (flat, API v1).
type registryPayload struct {
	SchemaVersion int          `json:"schemaVersion"`
	Extensions    []StoreEntry `json:"extensions"`
}

// Market is the registry client: catalog cache, store installs, update checks
// and the auto-update loop (spec §5.1). Pure Go (no Wails imports) — events go
// through the injected emit func so tests can record them.
type Market struct {
	svc       *Service
	baseURL   string
	cachePath string
	client    *http.Client
	emit      func(name string, data any)
	now       func() time.Time // test seam for the TTL clock
	mu        sync.Mutex       // serializes catalog fetch + cache file access
	startOnce sync.Once        // the auto-update loop starts at most once
}

// NewMarket builds a Market over svc. cachePath is the catalog cache file
// (dataDir/store-cache.json); baseURL comes from RegistryBaseURL().
func NewMarket(svc *Service, cachePath, baseURL string, emit func(name string, data any)) *Market {
	return &Market{
		svc:       svc,
		baseURL:   strings.TrimRight(baseURL, "/"),
		cachePath: cachePath,
		client: &http.Client{
			Timeout: marketHTTPTimeout,
			// A redirect must not downgrade security: re-validate every hop.
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return checkRegistryURL(req.URL.String())
			},
		},
		emit: emit,
		now:  time.Now,
	}
}

// get fetches baseURL+path with an optional If-None-Match, capping the body at
// maxBytes. Returns the HTTP status, body (nil on 304) and the response ETag.
func (m *Market) get(path, ifNoneMatch string, maxBytes int64) (status int, body []byte, etag string, err error) {
	req, err := http.NewRequest(http.MethodGet, m.baseURL+path, nil)
	if err != nil {
		return 0, nil, "", fmt.Errorf("%w: %v", ErrDownload, err)
	}
	if ifNoneMatch != "" {
		req.Header.Set("If-None-Match", ifNoneMatch)
	}
	resp, err := m.client.Do(req)
	if err != nil {
		return 0, nil, "", fmt.Errorf("%w: %v", ErrDownload, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotModified {
		return resp.StatusCode, nil, resp.Header.Get("ETag"), nil
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxBytes+1))
	if err != nil {
		return 0, nil, "", fmt.Errorf("%w: %v", ErrDownload, err)
	}
	if int64(len(data)) > maxBytes {
		return 0, nil, "", fmt.Errorf("%w: response exceeds %d bytes", ErrTooLarge, maxBytes)
	}
	return resp.StatusCode, data, resp.Header.Get("ETag"), nil
}

// loadCache reads the catalog cache; nil on any error (missing/corrupt → refetch).
func (m *Market) loadCache() *storeCache {
	data, err := os.ReadFile(m.cachePath)
	if err != nil {
		return nil
	}
	var c storeCache
	if err := json.Unmarshal(data, &c); err != nil {
		return nil
	}
	return &c
}

// saveCache writes the catalog cache atomically, best-effort: a failed write
// only costs a refetch next time.
func (m *Market) saveCache(c *storeCache) {
	data, err := json.Marshal(c)
	if err != nil {
		return
	}
	tmp := m.cachePath + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		_ = os.Remove(tmp)
		return
	}
	if err := os.Rename(tmp, m.cachePath); err != nil {
		_ = os.Remove(tmp)
	}
}

// StoreCatalog returns the catalog: straight from cache inside the TTL,
// revalidated with If-None-Match after it, and stale-from-cache when the
// registry is unreachable (spec §5.1/§7). force bypasses the TTL (manual
// refresh) but still uses the ETag, so a 304 stays cheap.
func (m *Market) StoreCatalog(force bool) (Catalog, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	cache := m.loadCache()
	if cache != nil && !force && m.now().Sub(cache.FetchedAt) < catalogTTL {
		return Catalog{Extensions: cache.Extensions, FetchedAt: cache.FetchedAt}, nil
	}
	etag := ""
	if cache != nil {
		etag = cache.ETag
	}
	status, body, newETag, err := m.get("/v1/registry", etag, catalogMaxBytes)
	switch {
	case err == nil && status == http.StatusNotModified && cache != nil:
		cache.FetchedAt = m.now()
		m.saveCache(cache)
		return Catalog{Extensions: cache.Extensions, FetchedAt: cache.FetchedAt}, nil
	case err == nil && status == http.StatusOK:
		var p registryPayload
		if jsonErr := json.Unmarshal(body, &p); jsonErr != nil {
			err = fmt.Errorf("%w: bad catalog JSON: %v", ErrDownload, jsonErr)
			break
		}
		c := &storeCache{ETag: newETag, FetchedAt: m.now(), Extensions: p.Extensions}
		m.saveCache(c)
		return Catalog{Extensions: p.Extensions, FetchedAt: c.FetchedAt}, nil
	case err == nil:
		err = fmt.Errorf("%w: status %d", ErrDownload, status)
	}
	// Network/HTTP failure: fall back to the cache, marked stale (spec §7).
	if cache != nil {
		return Catalog{Extensions: cache.Extensions, Stale: true, FetchedAt: cache.FetchedAt}, nil
	}
	return Catalog{}, err
}
