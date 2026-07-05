// Package files provides editor file I/O (read/write/stat) and a per-pane draft
// store for unsaved buffers. It is isolated from internal/core (no PTY/sessions).
package files

import (
	"bytes"
	"errors"
	"os"
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

// Write saves data to path atomically (temp file + rename), mirroring LayoutStore.
func Write(path string, data []byte) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
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
