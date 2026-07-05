package core

import "path/filepath"

// Core is the daemon-ready boundary of the backend. Today it is called
// in-process from the Wails app; later the same interface can be served by a
// standalone daemon over a local socket without changing callers (spec §4).
type Core interface {
	Spawn(id PaneID, cwd string, cols, rows uint16) error
	Write(id PaneID, data []byte) error
	Resize(id PaneID, cols, rows uint16) error
	Kill(id PaneID) error
	ShellTag(id PaneID) string
	SaveLayout(data []byte) error
	LoadLayout() ([]byte, error)
	LoadScrollback(id PaneID) ([]byte, error)
	FlushAll() error
}

type core struct {
	sm *SessionManager
	ls *LayoutStore
	sb *ScrollbackStore
}

// NewCore wires the session manager, scrollback store, and layout store under
// dataDir. shell may be "" to use the user's $SHELL.
func NewCore(sink OutputSink, dataDir, shell string) (Core, error) {
	sb, err := NewScrollbackStore(filepath.Join(dataDir, "scrollback"), DefaultScrollbackBytes)
	if err != nil {
		return nil, err
	}
	ls := NewLayoutStore(filepath.Join(dataDir, "layout.json"))
	sm := NewSessionManager(sink, sb, shell)
	return &core{sm: sm, ls: ls, sb: sb}, nil
}

func (c *core) Spawn(id PaneID, cwd string, cols, rows uint16) error {
	return c.sm.Spawn(id, cwd, cols, rows)
}
func (c *core) Write(id PaneID, data []byte) error        { return c.sm.Write(id, data) }
func (c *core) Resize(id PaneID, cols, rows uint16) error { return c.sm.Resize(id, cols, rows) }
func (c *core) Kill(id PaneID) error                      { return c.sm.Kill(id) }
func (c *core) ShellTag(id PaneID) string                 { return c.sm.ShellTag(id) }
func (c *core) SaveLayout(data []byte) error              { return c.ls.Save(data) }
func (c *core) LoadLayout() ([]byte, error)               { return c.ls.Load() }

// LoadScrollback returns a pane's recent output for replay. A live session keeps
// its output in the in-memory ring (the on-disk .log is only written on exit), so
// return the snapshot when non-empty — this is the §9 replay-on-tab-switch path.
// Fall back to disk only when the ring is empty (e.g. after an app restart, where
// the process lost its in-memory rings — Plan 3c restore).
func (c *core) LoadScrollback(id PaneID) ([]byte, error) {
	if snap := c.sb.Snapshot(id); len(snap) > 0 {
		return snap, nil
	}
	return c.sb.Load(id)
}

// FlushAll persists every live session's scrollback ring to disk. The app's
// OnShutdown hook calls this so restored panes replay real history (design §12.5).
func (c *core) FlushAll() error { return c.sm.FlushAll() }
