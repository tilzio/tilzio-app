package core

import (
	"encoding/json"
	"fmt"
	"os"
	"time"
)

// LayoutStore persists the frontend layout as opaque JSON bytes. The typed
// schema lives in the frontend; the core only validates and stores it.
type LayoutStore struct {
	path string
}

func NewLayoutStore(path string) *LayoutStore { return &LayoutStore{path: path} }

// Save writes data atomically (temp file + rename) to avoid partial/corrupt
// files on crash.
func (l *LayoutStore) Save(data []byte) error {
	tmp := l.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, l.path)
}

// Load returns the stored layout bytes. Returns ErrNotFound if absent, and
// ErrCorrupt (after backing up the bad file) if present but not valid JSON.
func (l *LayoutStore) Load() ([]byte, error) {
	data, err := os.ReadFile(l.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if !json.Valid(data) {
		backup := fmt.Sprintf("%s.corrupt-%d", l.path, time.Now().Unix())
		_ = os.Rename(l.path, backup)
		return nil, ErrCorrupt
	}
	return data, nil
}
