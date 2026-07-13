// Package files provides editor file I/O (read/write/stat) and a per-pane draft
// store for unsaved buffers. It is isolated from internal/core (no PTY/sessions).
package files

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
)

// MaxFileBytes caps the size of a file the editor will open. Larger files are
// rejected — the editor is for source/markdown, not huge logs/blobs.
const MaxFileBytes = 5 << 20 // 5 MiB

var (
	ErrTooLarge = errors.New("file too large")
	ErrBinary   = errors.New("file appears to be binary")
)

// Stat describes a path for link validation / pre-open checks.
type Stat struct {
	Exists bool `json:"exists"`
	IsDir  bool `json:"isDir"`
}

// Read returns the text content of path. Rejects files over MaxFileBytes and
// files that look binary (contain a NUL byte) — the editor handles text only.
func Read(path string) ([]byte, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if info.Size() > MaxFileBytes {
		return nil, ErrTooLarge
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if isBinary(data) {
		return nil, ErrBinary
	}
	return data, nil
}

// Write saves data to path atomically (unique temp file in the target's dir +
// rename). The destination is resolved through symlinks first, so saving through
// a symlink updates the TARGET file and keeps the link intact, and an existing
// file keeps its permission bits (0644 only for brand-new files). The temp name
// comes from os.CreateTemp, so two panes saving the same file concurrently never
// share (and interleave on) one temp path.
func Write(path string, data []byte) error {
	target := path
	if resolved, err := filepath.EvalSymlinks(path); err == nil {
		target = resolved
	} // else: the file doesn't exist yet (or a dangling link) — write to path itself
	mode := os.FileMode(0o644)
	if info, err := os.Stat(target); err == nil {
		mode = info.Mode().Perm()
	}
	tmp, err := os.CreateTemp(filepath.Dir(target), filepath.Base(target)+".tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	fail := func(e error) error {
		_ = tmp.Close()
		_ = os.Remove(tmpName)
		return e
	}
	if _, err := tmp.Write(data); err != nil {
		return fail(err)
	}
	// CreateTemp creates 0600; restore the target's bits (exact, not umask-filtered).
	if err := tmp.Chmod(mode); err != nil {
		return fail(err)
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpName)
		return err
	}
	if err := os.Rename(tmpName, target); err != nil {
		_ = os.Remove(tmpName)
		return err
	}
	return nil
}

// StatPath reports whether path exists and whether it is a directory. Any stat
// error (missing, permission) yields Exists:false — callers only linkify/open
// paths that resolve.
func StatPath(path string) Stat {
	info, err := os.Stat(path)
	if err != nil {
		return Stat{}
	}
	return Stat{Exists: true, IsDir: info.IsDir()}
}

func isBinary(data []byte) bool {
	n := len(data)
	if n > 8192 {
		n = 8192
	}
	return bytes.IndexByte(data[:n], 0) >= 0
}
