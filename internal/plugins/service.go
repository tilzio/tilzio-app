package plugins

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	securejoin "github.com/cyphar/filepath-securejoin"
)

// PluginInfo is the listing entry for one plugin (design §4): manifest +
// persisted status. Dir (the folder name within pluginsDir, not an absolute
// path) is always set; Manifest is nil for a broken plugin and Err carries the
// reason.
type PluginInfo struct {
	Dir         string    `json:"dir"`
	Manifest    *Manifest `json:"manifest"`
	Enabled     bool      `json:"enabled"`
	Permissions []string  `json:"permissions"`
	Err         string    `json:"err"`
}

// Service is the plugin registry facade: discovery (fresh scan) + persisted
// state. It is pure Go (no Wails) and holds no core/PTY access (design §9).
type Service struct {
	pluginsDir string
	store      *PluginStore
}

// NewService builds a registry over pluginsDir (folders) and storePath
// (plugins.json).
func NewService(pluginsDir, storePath string) *Service {
	return &Service{pluginsDir: pluginsDir, store: NewPluginStore(storePath)}
}

// List freshly scans the plugins dir and merges persisted state (design §4).
// Broken plugins are included with their Err set.
func (s *Service) List() []PluginInfo {
	_, items := Discover(s.pluginsDir)
	out := make([]PluginInfo, 0, len(items))
	for _, it := range items {
		info := PluginInfo{Dir: it.Dir, Manifest: it.Manifest, Err: it.Err}
		if it.Manifest != nil && it.Err == "" {
			if enabled, perms, ok := s.store.State(it.Manifest.ID); ok {
				info.Enabled = enabled
				info.Permissions = perms
			}
		}
		out = append(out, info)
	}
	return out
}

// resolve returns the absolute folder and manifest for a valid plugin id (fresh
// scan, so newly-added folders resolve without restart). Unknown/broken → ErrNotFound.
func (s *Service) resolve(id string) (dir string, m *Manifest, err error) {
	dirs, items := Discover(s.pluginsDir)
	abs, ok := dirs[id]
	if !ok {
		return "", nil, ErrNotFound
	}
	for _, it := range items {
		if it.Manifest != nil && it.Manifest.ID == id {
			return abs, it.Manifest, nil
		}
	}
	return "", nil, ErrNotFound
}

// SetEnabled toggles a plugin. Enabling snapshots the manifest's requested
// permissions as granted (design §5). Unknown/broken id → ErrNotFound.
func (s *Service) SetEnabled(id string, enabled bool) error {
	_, m, err := s.resolve(id)
	if err != nil {
		return err
	}
	return s.store.SetEnabled(id, enabled, m.Permissions)
}

// ReadFile returns the bytes of relPath within the plugin's folder, secure-joined
// (design §6). Unknown/broken id → ErrNotFound.
func (s *Service) ReadFile(id, relPath string) ([]byte, error) {
	dir, _, err := s.resolve(id)
	if err != nil {
		return nil, err
	}
	return secureRead(dir, relPath)
}

// HasPermission reports whether perm is declared in the manifest of plugin id
// (informational, trusted §2). Used by the asset-handler to decide CSP network. Unknown id → false.
func (s *Service) HasPermission(id, perm string) bool {
	_, m, err := s.resolve(id)
	if err != nil {
		return false
	}
	for _, p := range m.Permissions {
		if p == perm {
			return true
		}
	}
	return false
}

// StorageGet returns a plugin's stored value (canonical compact JSON) for key.
// Storage persists across rescans independently of whether the folder is
// currently present (design §4: orphaned state is kept).
func (s *Service) StorageGet(id, key string) (json.RawMessage, error) {
	return s.store.StorageGet(id, key)
}

// StorageSet stores value under key for a plugin, subject to the store's quota
// (design §5). Like StorageGet, it does not require the plugin to be currently
// present on disk.
func (s *Service) StorageSet(id, key string, value json.RawMessage) error {
	return s.store.StorageSet(id, key, value)
}

// Exec runs an allow-listed binary for plugin id via the broker (design §3.2).
// Enforces bin ∈ manifest.exec (exact string match). The broker is captured and
// isolated from core/PTY. `permissions` is informational (not gated, trusted §2);
// only the binary allow-list is enforced. Unknown/broken id → ErrNotFound.
func (s *Service) Exec(id, bin string, args []string, cwd string) (ExecResult, error) {
	_, m, err := s.resolve(id)
	if err != nil {
		return ExecResult{}, err
	}
	if !execAllowed(m.Exec, bin) {
		return ExecResult{}, ErrExecNotAllowed
	}
	return runExec(bin, args, cwd, execTimeout, execMaxBytes)
}

// execAllowed reports whether bin is in the manifest allow-list (exact match, no
// path normalization: "./git" ≠ "git", "/usr/bin/git" ≠ "git").
func execAllowed(list []string, bin string) bool {
	for _, b := range list {
		if b == bin {
			return true
		}
	}
	return false
}

// InstallResult is the outcome of an install attempt. Status is "installed" (Info
// set) or "conflict" (Conflict set — an id is already installed and overwrite was
// false; the frontend asks the user, then retries with overwrite=true).
type InstallResult struct {
	Status   string      `json:"status"`
	Info     *PluginInfo `json:"info,omitempty"`
	Conflict *Conflict   `json:"conflict,omitempty"`
}

// Conflict describes an id that is already installed.
type Conflict struct {
	ID              string `json:"id"`
	ExistingVersion string `json:"existingVersion"`
	NewVersion      string `json:"newVersion"`
}

// InstallZip validates and installs a plugin from a zip archive. It unpacks into a
// temp dir inside pluginsDir (same filesystem → atomic rename), validates the
// manifest, and only then moves it to plugins/<id>/. An already-installed id with
// overwrite=false returns a conflict result without changing anything. Overwrite
// replaces the existing folder; enabled/granted/storage in plugins.json are kept.
func (s *Service) InstallZip(data []byte, overwrite bool) (InstallResult, error) {
	// Cap the raw archive before zip.NewReader so a giant blob can't be held in
	// memory (the URL path is bounded by download; this bounds the bytes/base64
	// path too). Disk is separately bounded by the extraction limits.
	if int64(len(data)) > installMaxBytes {
		return InstallResult{}, fmt.Errorf("%w: archive exceeds %d bytes", ErrTooLarge, installMaxBytes)
	}
	if err := os.MkdirAll(s.pluginsDir, 0o755); err != nil {
		return InstallResult{}, err
	}

	// Snapshot existing plugins BEFORE creating the temp dir so that Discover
	// cannot see the .install-* folder and confuse it with an installed plugin.
	existingDirs, _ := Discover(s.pluginsDir)

	tmp, err := os.MkdirTemp(s.pluginsDir, ".install-")
	if err != nil {
		return InstallResult{}, err
	}
	defer os.RemoveAll(tmp)

	if err := safeUnzip(data, tmp, defaultUnzipLimits); err != nil {
		return InstallResult{}, err
	}
	root, err := locateManifestRoot(tmp)
	if err != nil {
		return InstallResult{}, err
	}
	mData, err := os.ReadFile(filepath.Join(root, "manifest.json"))
	if err != nil {
		return InstallResult{}, err
	}
	m, err := ParseManifest(mData)
	if err != nil {
		return InstallResult{}, err
	}

	existingAbs, exists := existingDirs[m.ID]
	if exists && !overwrite {
		return InstallResult{Status: "conflict", Conflict: &Conflict{
			ID: m.ID, ExistingVersion: readManifestVersion(existingAbs), NewVersion: m.Version,
		}}, nil
	}
	if exists {
		if err := os.RemoveAll(existingAbs); err != nil {
			return InstallResult{}, err
		}
	}
	target := filepath.Join(s.pluginsDir, m.ID)
	// Clear any folder already at the target name (e.g. a duplicate-id folder
	// literally named <id> that isn't the existingAbs we removed above) so the
	// Rename into a possibly non-empty existing dir cannot fail.
	if err := os.RemoveAll(target); err != nil {
		return InstallResult{}, err
	}
	// Rename the extracted root (which may equal tmp itself when manifest is at
	// the zip root). After a successful Rename, the deferred RemoveAll(tmp) is
	// a no-op because tmp no longer exists at that path.
	if err := os.Rename(root, target); err != nil {
		return InstallResult{}, err
	}
	return InstallResult{Status: "installed", Info: s.infoFor(m.ID)}, nil
}

// readManifestVersion best-effort reads the version from a plugin folder ("" on error).
func readManifestVersion(absDir string) string {
	data, err := os.ReadFile(filepath.Join(absDir, "manifest.json"))
	if err != nil {
		return ""
	}
	m, err := ParseManifest(data)
	if err != nil {
		return ""
	}
	return m.Version
}

// infoFor returns the PluginInfo for id from a fresh List (nil if absent).
func (s *Service) infoFor(id string) *PluginInfo {
	for _, it := range s.List() {
		if it.Manifest != nil && it.Manifest.ID == id {
			info := it
			return &info
		}
	}
	return nil
}

// InstallURL downloads an https zip and installs it (same path as InstallZip).
func (s *Service) InstallURL(rawURL string, overwrite bool) (InstallResult, error) {
	data, err := download(rawURL, installMaxBytes, installDownloadTO)
	if err != nil {
		return InstallResult{}, err
	}
	return s.InstallZip(data, overwrite)
}

// Uninstall removes a plugin folder by its directory name (PluginInfo.Dir — works
// for broken plugins too) and clears its registry record, keeping storage so a
// reinstall of the same id restores data (design §5).
func (s *Service) Uninstall(dirName string) error {
	full, err := securejoin.SecureJoin(s.pluginsDir, dirName)
	if err != nil {
		return err
	}
	// Guard against dirName "."/".." resolving to pluginsDir itself — RemoveAll
	// there would wipe every installed plugin.
	if full == s.pluginsDir {
		return fmt.Errorf("plugins: invalid plugin dir %q", dirName)
	}
	// Derive the id (for store cleanup) before removing the folder — but only
	// clean the store when THIS folder is the canonical one for the id
	// (Discover's winner): uninstalling a duplicate-id folder must not wipe the
	// surviving plugin's enabled/permissions/storage.
	var id string
	if data, err := os.ReadFile(filepath.Join(full, "manifest.json")); err == nil {
		if m, err := ParseManifest(data); err == nil {
			if dirs, _ := Discover(s.pluginsDir); dirs[m.ID] == full {
				id = m.ID
			}
		}
	}
	if err := os.RemoveAll(full); err != nil {
		return err
	}
	if id != "" {
		return s.store.RemovePlugin(id, true)
	}
	return nil
}

// StorageInfo exposes a plugin's stored-data summary for the detail page.
func (s *Service) StorageInfo(id string) StorageInfo {
	return s.store.StorageInfo(id)
}

// StorageClear wipes a plugin's stored settings/data (reset to defaults), keeping
// it enabled and its granted permissions.
func (s *Service) StorageClear(id string) error {
	return s.store.StorageClear(id)
}

// AutoUpdate reports the global store auto-update toggle (plugins.json, default true).
func (s *Service) AutoUpdate() bool { return s.store.AutoUpdate() }

// SetAutoUpdate persists the global store auto-update toggle.
func (s *Service) SetAutoUpdate(v bool) error { return s.store.SetAutoUpdate(v) }
