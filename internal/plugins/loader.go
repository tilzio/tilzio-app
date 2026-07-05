package plugins

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"

	securejoin "github.com/cyphar/filepath-securejoin"
)

// MaxReadBytes caps the size of a plugin file the host will read into memory.
const MaxReadBytes = 5 * 1024 * 1024

// Discovered is one plugin folder found on disk: its directory name, the parsed
// manifest (nil if invalid), and a human-readable error reason ("" if valid).
type Discovered struct {
	Dir      string
	Manifest *Manifest
	Err      string
}

// Discover scans pluginsDir for <folder>/manifest.json, parses+validates each,
// and returns: dirs (id → absolute folder path, valid plugins only) and items
// (every folder, valid and broken, for listing). A second folder claiming an
// already-seen id is marked "duplicate id". A missing pluginsDir is not an error
// (empty result; items is nil in that case — callers should range/len it, not
// compare to nil). Folders are scanned in stable name order so duplicate-id
// resolution and listing are deterministic.
func Discover(pluginsDir string) (dirs map[string]string, items []Discovered) {
	dirs = map[string]string{}
	entries, err := os.ReadDir(pluginsDir)
	if err != nil {
		return dirs, nil // missing dir → nothing installed
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		// Skip hidden/service folders, notably the ".install-*" temp dir an install
		// creates inside pluginsDir (it briefly holds a valid manifest mid-extract).
		if len(name) > 0 && name[0] == '.' {
			continue
		}
		abs := filepath.Join(pluginsDir, name)
		data, err := os.ReadFile(filepath.Join(abs, "manifest.json"))
		if err != nil {
			reason := "manifest.json not readable"
			if os.IsNotExist(err) {
				reason = "no manifest.json"
			}
			items = append(items, Discovered{Dir: name, Err: reason})
			continue
		}
		m, err := ParseManifest(data)
		if err != nil {
			items = append(items, Discovered{Dir: name, Err: err.Error()})
			continue
		}
		if _, dup := dirs[m.ID]; dup {
			items = append(items, Discovered{Dir: name, Manifest: m, Err: "duplicate id: " + m.ID})
			continue
		}
		dirs[m.ID] = abs
		items = append(items, Discovered{Dir: name, Manifest: m})
	}
	return dirs, items
}

// secureRead reads rel from within baseDir, refusing any path that escapes the
// folder (traversal, absolute, or a symlink pointing outside — SecureJoin scopes
// symlink resolution to baseDir). It rejects non-regular files (a FIFO/device
// could block os.ReadFile indefinitely; a directory is not a readable asset) and
// files larger than MaxReadBytes.
//
// NOTE: a residual TOCTOU window exists between SecureJoin resolving the path and
// os.ReadFile opening it — a documented limitation of the SecureJoin API. An
// attacker who can already write inside the plugin folder AND win a tight race
// could redirect the read; accepted for the single-user desktop model. A future
// hardening is securejoin.OpenInRoot (resolve + open atomically).
func secureRead(baseDir, rel string) ([]byte, error) {
	full, err := securejoin.SecureJoin(baseDir, rel)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(full)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, fmt.Errorf("not a regular file: %s", rel)
	}
	if info.Size() > MaxReadBytes {
		return nil, fmt.Errorf("file too large: %d bytes (max %d)", info.Size(), MaxReadBytes)
	}
	return os.ReadFile(full)
}
