package core

import "errors"

// PaneID is an opaque, frontend-generated identifier for a single terminal
// (a leaf in the layout tree). Assumed filesystem-safe (UUID/nanoid).
type PaneID string

// DefaultScrollbackBytes caps the persisted restore-history kept per pane in
// memory and on disk. This is independent of xterm.js's own on-screen
// scrollback (5000 lines, configured on the frontend).
const DefaultScrollbackBytes = 1 << 20 // 1 MiB

var (
	// ErrNotFound is returned by LayoutStore.Load when no layout file exists yet.
	ErrNotFound = errors.New("core: layout not found")
	// ErrCorrupt is returned by LayoutStore.Load when the layout file is not
	// valid JSON; the bad file is backed up alongside.
	ErrCorrupt = errors.New("core: layout file corrupt")
	// ErrNoSession is returned when addressing a pane with no live session.
	ErrNoSession = errors.New("core: no such session")
	// ErrAlreadySpawned is returned by SessionManager.Spawn when a session
	// already exists for the given pane id.
	ErrAlreadySpawned = errors.New("core: session already exists for pane")
	// ErrBadPaneID is returned by file-touching ScrollbackStore methods when the
	// pane id is not a safe filename (guards against path traversal).
	ErrBadPaneID = errors.New("core: invalid pane id")
)
