package main

import "github.com/tilzio/tilzio/internal/files"

// FilesApp is the Wails service exposing editor file I/O and the draft store to
// the frontend (design §5.6). Exported methods become TS bindings under FilesApp.*.
// It holds no core.Core — file ops never touch sessions/PTY (§9).
type FilesApp struct {
	drafts *files.DraftStore
}

func NewFilesApp(drafts *files.DraftStore) *FilesApp { return &FilesApp{drafts: drafts} }

// ReadFile returns a text file's content. Rejects oversized/binary files.
func (f *FilesApp) ReadFile(path string) (string, error) {
	b, err := files.Read(path)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// WriteFile saves content to path atomically (editor ⌘S).
func (f *FilesApp) WriteFile(path string, content string) error {
	return files.Write(path, []byte(content))
}

// StatFile reports whether path exists and is a directory (link validation, §6).
func (f *FilesApp) StatFile(path string) files.Stat {
	return files.StatPath(path)
}

// DraftResult is LoadDraft's boundary type (found + the draft fields).
type DraftResult struct {
	Found   bool   `json:"found"`
	Path    string `json:"path"`
	Content string `json:"content"`
}

// SaveDraft persists an unsaved editor buffer for paneID (debounced on edit).
func (f *FilesApp) SaveDraft(paneID string, path string, content string) error {
	return f.drafts.Save(paneID, path, content)
}

// LoadDraft returns paneID's persisted draft (restore on remount/restart).
func (f *FilesApp) LoadDraft(paneID string) (DraftResult, error) {
	d, found, err := f.drafts.Load(paneID)
	if err != nil {
		return DraftResult{}, err
	}
	return DraftResult{Found: found, Path: d.Path, Content: d.Content}, nil
}

// ClearDraft removes paneID's draft (on ⌘S or pane close).
func (f *FilesApp) ClearDraft(paneID string) error {
	return f.drafts.Clear(paneID)
}

// ListDrafts returns metadata for all persisted drafts (restore on startup).
func (f *FilesApp) ListDrafts() ([]files.DraftMeta, error) {
	return f.drafts.List()
}
