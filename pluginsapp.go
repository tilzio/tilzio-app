package main

import (
	"encoding/base64"
	"encoding/json"

	"github.com/tilzio/tilzio/internal/plugins"
)

// PluginsApp is the Wails service exposing the plugin registry to the frontend.
// Its exported methods become TypeScript bindings under the Plugins.* namespace.
// It is a thin adapter over plugins.Service (string/base64 at the boundary, like
// App). It holds no core.Core — plugins never touch sessions/PTY (design §9).
type PluginsApp struct {
	svc    *plugins.Service
	market *plugins.Market
}

func NewPluginsApp(svc *plugins.Service, market *plugins.Market) *PluginsApp {
	return &PluginsApp{svc: svc, market: market}
}

// PluginsList returns every discovered plugin with its manifest and status.
func (p *PluginsApp) PluginsList() []plugins.PluginInfo {
	return p.svc.List()
}

// PluginSetEnabled enables or disables a plugin by id.
func (p *PluginsApp) PluginSetEnabled(id string, enabled bool) error {
	return p.svc.SetEnabled(id, enabled)
}

// PluginReadFile returns a plugin file (main.js, icon, …) as base64, secure-joined
// within the plugin's folder.
func (p *PluginsApp) PluginReadFile(id string, relPath string) (string, error) {
	b, err := p.svc.ReadFile(id, relPath)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(b), nil
}

// PluginStorageGet returns the JSON-string value stored under key for plugin id.
func (p *PluginsApp) PluginStorageGet(id string, key string) (string, error) {
	v, err := p.svc.StorageGet(id, key)
	if err != nil {
		return "", err
	}
	return string(v), nil
}

// PluginStorageSet stores valueJSON (a JSON string) under key for plugin id.
func (p *PluginsApp) PluginStorageSet(id string, key string, valueJSON string) error {
	return p.svc.StorageSet(id, key, json.RawMessage(valueJSON))
}

// PluginInstallZip installs a plugin from a base64-encoded zip. overwrite=false
// returns a conflict result when the id already exists; the frontend confirms and
// retries with overwrite=true.
func (p *PluginsApp) PluginInstallZip(b64 string, overwrite bool) (plugins.InstallResult, error) {
	data, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return plugins.InstallResult{}, err
	}
	return p.svc.InstallZip(data, overwrite)
}

// PluginInstallURL installs a plugin from an https zip URL.
func (p *PluginsApp) PluginInstallURL(url string, overwrite bool) (plugins.InstallResult, error) {
	return p.svc.InstallURL(url, overwrite)
}

// PluginUninstall removes a plugin by its folder name (PluginInfo.Dir); storage is
// kept so a reinstall of the same id restores data.
func (p *PluginsApp) PluginUninstall(dir string) error {
	return p.svc.Uninstall(dir)
}

// PluginStorageInfo returns a plugin's stored-data summary (keys/bytes) for the
// detail page.
func (p *PluginsApp) PluginStorageInfo(id string) (plugins.StorageInfo, error) {
	return p.svc.StorageInfo(id), nil
}

// PluginStorageClear wipes a plugin's stored settings/data (reset to defaults),
// keeping it enabled and its granted permissions.
func (p *PluginsApp) PluginStorageClear(id string) error {
	return p.svc.StorageClear(id)
}

// PluginExec runs an allow-listed binary for the plugin via the Go broker
// (design §3.3, SP-5). Captured (not PTY), isolated from core; bin must be in the
// manifest's exec allow-list. ExecResult is JSON-marshalled to the frontend.
func (p *PluginsApp) PluginExec(id string, bin string, args []string, cwd string) (plugins.ExecResult, error) {
	return p.svc.Exec(id, bin, args, cwd)
}

// StoreCatalog returns the registry catalog (ETag/TTL cached; Stale=true when
// the registry is unreachable and the cache was served). force bypasses the TTL.
func (p *PluginsApp) StoreCatalog(force bool) (plugins.Catalog, error) {
	return p.market.StoreCatalog(force)
}

// StoreDetail returns one extension's detail (summary + README + versions).
func (p *PluginsApp) StoreDetail(id string) (plugins.StoreDetail, error) {
	return p.market.StoreDetail(id)
}

// StoreInstall downloads, sha256-verifies and installs id's current catalog
// version (overwrite semantics — state/storage survive).
func (p *PluginsApp) StoreInstall(id string) (plugins.InstallResult, error) {
	return p.market.StoreInstall(id)
}

// StoreCheckUpdates compares installed manifests against the catalog.
func (p *PluginsApp) StoreCheckUpdates() ([]plugins.UpdateInfo, error) {
	return p.market.StoreCheckUpdates()
}

// StoreAutoUpdate reports the global auto-update toggle (default true).
func (p *PluginsApp) StoreAutoUpdate() bool { return p.svc.AutoUpdate() }

// StoreSetAutoUpdate persists the global auto-update toggle.
func (p *PluginsApp) StoreSetAutoUpdate(v bool) error { return p.svc.SetAutoUpdate(v) }

// StoreStartAutoUpdate starts the 24h auto-update loop (idempotent). The
// frontend calls it once at startup AFTER subscribing to store:* events.
func (p *PluginsApp) StoreStartAutoUpdate() { p.market.StartAutoUpdate() }
