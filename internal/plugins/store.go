package plugins

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"time"
)

// MaxStorageBytes caps a single plugin's serialized storage (design §5).
const MaxStorageBytes = 256 * 1024

type pluginState struct {
	Enabled     bool                       `json:"enabled"`
	Permissions []string                   `json:"permissions,omitempty"`
	Storage     map[string]json.RawMessage `json:"storage,omitempty"`
}

type storeFile struct {
	Plugins map[string]*pluginState `json:"plugins"`
}

// PluginStore persists plugin state (enabled / granted permissions / storage) to
// plugins.json atomically, separate from layout.json (design §5/§10). A corrupt
// or missing file yields an empty registry rather than an error — the store
// always returns a working state.
type PluginStore struct {
	path string
	mu   sync.Mutex
}

func NewPluginStore(path string) *PluginStore { return &PluginStore{path: path} }

// load reads the whole file under the caller's lock. Missing → empty; corrupt →
// backup aside + empty (mirrors layoutstore's corrupt handling).
func (s *PluginStore) load() *storeFile {
	empty := &storeFile{Plugins: map[string]*pluginState{}}
	data, err := os.ReadFile(s.path)
	if err != nil {
		return empty // missing (or unreadable) → empty registry
	}
	var f storeFile
	if err := json.Unmarshal(data, &f); err != nil {
		backup := fmt.Sprintf("%s.corrupt-%d", s.path, time.Now().Unix())
		_ = os.Rename(s.path, backup)
		return empty
	}
	if f.Plugins == nil {
		f.Plugins = map[string]*pluginState{}
	}
	return &f
}

// save writes the file atomically (temp + rename), like layoutstore.Save.
func (s *PluginStore) save(f *storeFile) error {
	data, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		_ = os.Remove(tmp) // best-effort cleanup of a partial temp file
		return err
	}
	if err := os.Rename(tmp, s.path); err != nil {
		_ = os.Remove(tmp) // best-effort cleanup if the rename fails
		return err
	}
	return nil
}

// State returns a plugin's persisted enabled flag and granted permissions.
// ok is false when there is no record for id.
func (s *PluginStore) State(id string) (enabled bool, perms []string, ok bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	f := s.load()
	st, ok := f.Plugins[id]
	if !ok {
		return false, nil, false
	}
	perms = append([]string(nil), st.Permissions...)
	return st.Enabled, perms, true
}

// SetEnabled records enabled for id. When enabling, it snapshots grantedPerms
// (the manifest's requested permissions) as the granted set (design §5); when
// disabling, existing granted permissions are kept as history.
func (s *PluginStore) SetEnabled(id string, enabled bool, grantedPerms []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	f := s.load()
	st := f.Plugins[id]
	if st == nil {
		st = &pluginState{}
		f.Plugins[id] = st
	}
	st.Enabled = enabled
	if enabled {
		st.Permissions = append([]string(nil), grantedPerms...)
	}
	return s.save(f)
}

// StorageGet returns the value stored under key for plugin id as canonical
// compact JSON. Returns ErrNotFound if the plugin has no record or no such key.
// (plugins.json is saved pretty-printed, which re-indents nested values, so the
// stored bytes are compacted back to a stable minimal form here.)
func (s *PluginStore) StorageGet(id, key string) (json.RawMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	f := s.load()
	st := f.Plugins[id]
	if st == nil || st.Storage == nil {
		return nil, ErrNotFound
	}
	v, ok := st.Storage[key]
	if !ok {
		return nil, ErrNotFound
	}
	var buf bytes.Buffer
	if err := json.Compact(&buf, v); err != nil {
		return v, nil // v originated from valid JSON; defensive fallback
	}
	return json.RawMessage(buf.Bytes()), nil
}

// StorageSet stores value (raw JSON) under key for plugin id. It rejects the
// write with ErrQuotaExceeded if the plugin's serialized storage would exceed
// MaxStorageBytes (design §5).
func (s *PluginStore) StorageSet(id, key string, value json.RawMessage) error {
	if !json.Valid(value) {
		return fmt.Errorf("storage value is not valid JSON")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	f := s.load()
	st := f.Plugins[id]
	if st == nil {
		st = &pluginState{}
		f.Plugins[id] = st
	}
	if st.Storage == nil {
		st.Storage = map[string]json.RawMessage{}
	}
	// Measure the would-be size before committing; roll back on overflow.
	prev, had := st.Storage[key]
	st.Storage[key] = value
	if storageSize(st.Storage) > MaxStorageBytes {
		if had {
			st.Storage[key] = prev
		} else {
			delete(st.Storage, key)
		}
		return ErrQuotaExceeded
	}
	return s.save(f)
}

func storageSize(m map[string]json.RawMessage) int {
	b, err := json.Marshal(m)
	if err != nil {
		return 0
	}
	return len(b)
}

// StorageInfo summarises a plugin's stored data for the detail page.
type StorageInfo struct {
	Keys  int `json:"keys"`
	Bytes int `json:"bytes"`
}

// StorageInfo returns the number of stored keys and serialized byte size for id.
func (s *PluginStore) StorageInfo(id string) StorageInfo {
	s.mu.Lock()
	defer s.mu.Unlock()
	f := s.load()
	st := f.Plugins[id]
	if st == nil || len(st.Storage) == 0 {
		return StorageInfo{}
	}
	return StorageInfo{Keys: len(st.Storage), Bytes: storageSize(st.Storage)}
}

// RemovePlugin clears a plugin's enabled flag and granted permissions on uninstall.
// When keepStorage is true and the plugin has stored data, the record is reduced to
// just its storage (so reinstalling the same id restores data); otherwise the whole
// record is dropped.
func (s *PluginStore) RemovePlugin(id string, keepStorage bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	f := s.load()
	st := f.Plugins[id]
	if st == nil {
		return nil
	}
	if keepStorage && len(st.Storage) > 0 {
		f.Plugins[id] = &pluginState{Storage: st.Storage}
	} else {
		delete(f.Plugins, id)
	}
	return s.save(f)
}

// StorageClear wipes a plugin's stored data, keeping its Enabled flag and granted
// Permissions (settings reset to defaults). No-op if the record or its storage is
// absent. Other plugins are not touched.
func (s *PluginStore) StorageClear(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	f := s.load()
	st := f.Plugins[id]
	if st == nil || len(st.Storage) == 0 {
		return nil
	}
	st.Storage = nil
	return s.save(f)
}
