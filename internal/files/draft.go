package files

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// DraftStore persists unsaved editor buffers per pane id, so edits survive an app
// restart (design §5.4, Variant 2). One JSON file per pane: <dir>/<paneID>.json.
type DraftStore struct {
	dir string
}

// NewDraftStore returns a DraftStore rooted at dir (created lazily on first Save).
func NewDraftStore(dir string) *DraftStore { return &DraftStore{dir: dir} }

// Draft is an unsaved editor buffer: the file it edits and the current content.
type Draft struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

// DraftMeta identifies a persisted draft (for restore-on-startup listing).
type DraftMeta struct {
	PaneID string `json:"paneId"`
	Path   string `json:"path"`
}

var ErrBadPaneID = errors.New("invalid pane id")

// paneID is a frontend UUID; restrict to a safe filename charset to prevent path
// traversal via a crafted id.
var paneIDRe = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

func (s *DraftStore) path(paneID string) (string, error) {
	if !paneIDRe.MatchString(paneID) {
		return "", ErrBadPaneID
	}
	return filepath.Join(s.dir, paneID+".json"), nil
}

// Save writes paneID's draft atomically (temp + rename), creating the dir.
func (s *DraftStore) Save(paneID, path, content string) error {
	p, err := s.path(paneID)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(s.dir, 0o755); err != nil {
		return err
	}
	data, err := json.Marshal(Draft{Path: path, Content: content})
	if err != nil {
		return err
	}
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}

// Load returns paneID's draft. found=false if none exists.
func (s *DraftStore) Load(paneID string) (Draft, bool, error) {
	p, err := s.path(paneID)
	if err != nil {
		return Draft{}, false, err
	}
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return Draft{}, false, nil
		}
		return Draft{}, false, err
	}
	var d Draft
	if err := json.Unmarshal(data, &d); err != nil {
		return Draft{}, false, err
	}
	return d, true, nil
}

// Clear removes paneID's draft (on ⌘S or pane close). No-op if absent.
func (s *DraftStore) Clear(paneID string) error {
	p, err := s.path(paneID)
	if err != nil {
		return err
	}
	if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// List returns metadata for every persisted draft (restore on startup). Missing
// dir → empty; unreadable/malformed entries are skipped.
func (s *DraftStore) List() ([]DraftMeta, error) {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var out []DraftMeta
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".json") {
			continue
		}
		id := strings.TrimSuffix(name, ".json")
		d, found, err := s.Load(id)
		if err != nil || !found {
			continue
		}
		out = append(out, DraftMeta{PaneID: id, Path: d.Path})
	}
	return out, nil
}
