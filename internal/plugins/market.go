package plugins

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
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

	"golang.org/x/mod/semver"
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

// StoreVersion is one row of an extension's published-version history.
type StoreVersion struct {
	Version   string `json:"version"`
	SHA256    string `json:"sha256"`
	Size      int64  `json:"size"`
	CreatedAt string `json:"createdAt"`
}

// StoreDetail is the store card payload: summary + README + version history.
type StoreDetail struct {
	StoreEntry
	Readme   string         `json:"readme"`
	Versions []StoreVersion `json:"versions"`
}

// StoreDetail fetches one extension's detail (GET /v1/extensions/{id}, wrapped
// in {"data":...} per API v1). Not cached — it's a single card open, and the
// server allows it comfortably within its rate limit.
func (m *Market) StoreDetail(id string) (StoreDetail, error) {
	status, body, _, err := m.get("/v1/extensions/"+url.PathEscape(id), "", catalogMaxBytes)
	if err != nil {
		return StoreDetail{}, err
	}
	if status == http.StatusNotFound {
		return StoreDetail{}, ErrNotFound
	}
	if status != http.StatusOK {
		return StoreDetail{}, fmt.Errorf("%w: status %d", ErrDownload, status)
	}
	var p struct {
		Data StoreDetail `json:"data"`
	}
	if err := json.Unmarshal(body, &p); err != nil {
		return StoreDetail{}, fmt.Errorf("%w: bad detail JSON: %v", ErrDownload, err)
	}
	return p.Data, nil
}

// StoreInstall downloads id's current catalog version, verifies its sha256
// against the catalog entry and installs it with overwrite semantics (updates
// keep enabled/permissions/storage — spec §5.1). On any failure nothing on
// disk is touched.
func (m *Market) StoreInstall(id string) (InstallResult, error) {
	cat, err := m.StoreCatalog(false)
	if err != nil {
		return InstallResult{}, err
	}
	var entry *StoreEntry
	for i := range cat.Extensions {
		if cat.Extensions[i].ID == id {
			entry = &cat.Extensions[i]
			break
		}
	}
	if entry == nil {
		return InstallResult{}, ErrNotFound
	}
	path := "/v1/extensions/" + url.PathEscape(id) + "/" + url.PathEscape(entry.Version) + "/download"
	status, data, _, err := m.get(path, "", installMaxBytes)
	if err != nil {
		return InstallResult{}, err
	}
	if status != http.StatusOK {
		return InstallResult{}, fmt.Errorf("%w: status %d", ErrDownload, status)
	}
	sum := sha256.Sum256(data)
	if !strings.EqualFold(hex.EncodeToString(sum[:]), entry.SHA256) {
		return InstallResult{}, fmt.Errorf("%w: %s@%s", ErrChecksum, id, entry.Version)
	}
	// The catalog entry's permissions/exec are what the consent gate showed the
	// user (StoreCheckUpdates, frontend consent dialog); what actually gets
	// enforced at runtime is the zip's own manifest.json. A hostile registry
	// could advertise benign permissions in the catalog while shipping a zip
	// whose manifest declares more — the zip manifest must not exceed it.
	m2, err := manifestFromZip(data)
	if err != nil {
		return InstallResult{}, err
	}
	if hasNew(entry.Permissions, m2.Permissions) || hasNew(entry.Exec, m2.Exec) {
		return InstallResult{}, fmt.Errorf("%w: %s@%s", ErrManifestMismatch, id, entry.Version)
	}
	return m.svc.InstallZip(data, true)
}

// manifestFromZip reads and parses manifest.json out of a not-yet-installed
// zip so StoreInstall can check it against the catalog entry before handing
// the zip to InstallZip.
func manifestFromZip(data []byte) (*Manifest, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrBadArchive, err)
	}
	f := findManifestEntry(zr)
	if f == nil {
		return nil, fmt.Errorf("%w: no manifest.json in zip", ErrNoManifest)
	}
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	raw, err := io.ReadAll(io.LimitReader(rc, defaultUnzipLimits.maxFileBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(raw)) > defaultUnzipLimits.maxFileBytes {
		return nil, fmt.Errorf("%w: manifest.json exceeds per-file limit", ErrTooLarge)
	}
	return ParseManifest(raw)
}

// findManifestEntry locates manifest.json in the zip, mirroring
// locateManifestRoot's on-disk search (install.go): the archive root first,
// else the archive's single top-level directory.
func findManifestEntry(zr *zip.Reader) *zip.File {
	topDirs := map[string]bool{}
	for _, f := range zr.File {
		if f.Name == "manifest.json" {
			return f
		}
		if i := strings.IndexByte(f.Name, '/'); i > 0 {
			topDirs[f.Name[:i]] = true
		}
	}
	if len(topDirs) != 1 {
		return nil
	}
	var dir string
	for d := range topDirs {
		dir = d
	}
	want := dir + "/manifest.json"
	for _, f := range zr.File {
		if f.Name == want {
			return f
		}
	}
	return nil
}

// UpdateInfo describes one available update (spec §5.1). PermsChanged gates
// the silent auto-update: any NEW permission or exec binary requires consent.
type UpdateInfo struct {
	ID           string `json:"id"`
	From         string `json:"from"`
	To           string `json:"to"`
	PermsChanged bool   `json:"permsChanged"`
}

// StoreCheckUpdates compares installed manifests against the catalog (semver).
// Broken plugins (no manifest) and plugins absent from the catalog are skipped.
func (m *Market) StoreCheckUpdates() ([]UpdateInfo, error) {
	cat, err := m.StoreCatalog(false)
	if err != nil {
		return nil, err
	}
	byID := make(map[string]StoreEntry, len(cat.Extensions))
	for _, e := range cat.Extensions {
		byID[e.ID] = e
	}
	updates := []UpdateInfo{}
	for _, info := range m.svc.List() {
		if info.Manifest == nil || info.Err != "" {
			continue
		}
		entry, ok := byID[info.Manifest.ID]
		if !ok || !semverNewer(entry.Version, info.Manifest.Version) {
			continue
		}
		updates = append(updates, UpdateInfo{
			ID:   entry.ID,
			From: info.Manifest.Version,
			To:   entry.Version,
			PermsChanged: hasNew(info.Manifest.Permissions, entry.Permissions) ||
				hasNew(info.Manifest.Exec, entry.Exec),
		})
	}
	return updates, nil
}

// semverNewer reports a > b. Bare versions get the "v" prefix x/mod requires;
// an invalid version sorts below any valid one (x/mod semver semantics), so a
// registry entry with valid semver always updates a local dev build with a
// non-semver version string.
func semverNewer(a, b string) bool {
	return semver.Compare(canonV(a), canonV(b)) > 0
}

func canonV(v string) string {
	if v == "" || strings.HasPrefix(v, "v") {
		return v
	}
	return "v" + v
}

// hasNew reports whether add contains an item absent from base (set growth —
// removals don't gate).
func hasNew(base, add []string) bool {
	seen := make(map[string]bool, len(base))
	for _, b := range base {
		seen[b] = true
	}
	for _, a := range add {
		if !seen[a] {
			return true
		}
	}
	return false
}

const autoUpdateInterval = 24 * time.Hour

// Wails event names for the store. The frontend subscribes to all three BEFORE
// calling StartAutoUpdate (via the binding), so startup events are not lost.
const (
	EventStoreUpdates       = "store:updates"        // {"updates": []UpdateInfo}
	EventStoreUpdated       = "store:updated"        // {"id": string, "version": string}
	EventStoreConsentNeeded = "store:consent-needed" // UpdateInfo
)

// StartAutoUpdate launches the background update loop once: an immediate
// cycle, then every 24h (spec §5.1). Idempotent — extra calls are no-ops.
func (m *Market) StartAutoUpdate() {
	m.startOnce.Do(func() {
		go func() {
			m.autoUpdateCycle()
			ticker := time.NewTicker(autoUpdateInterval)
			defer ticker.Stop()
			for range ticker.C {
				m.autoUpdateCycle()
			}
		}()
	})
}

// autoUpdateCycle runs one check-and-install pass. Updates that grow
// permissions/exec are NOT installed — they are announced via consent events.
// Failures are logged and swallowed: no toast spam, retry next cycle (spec §7).
func (m *Market) autoUpdateCycle() {
	updates, err := m.StoreCheckUpdates()
	if err != nil {
		log.Printf("plugins: store update check: %v", err)
		return
	}
	if len(updates) == 0 {
		return
	}
	m.emit(EventStoreUpdates, map[string]any{"updates": updates})
	if !m.svc.AutoUpdate() {
		return
	}
	for _, u := range updates {
		if u.PermsChanged {
			m.emit(EventStoreConsentNeeded, u)
			continue
		}
		if _, err := m.StoreInstall(u.ID); err != nil {
			log.Printf("plugins: auto-update %s: %v", u.ID, err)
			continue
		}
		m.emit(EventStoreUpdated, map[string]any{"id": u.ID, "version": u.To})
	}
}
