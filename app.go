package main

import (
	"encoding/base64"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/tilzio/tilzio/internal/bridge"
	"github.com/tilzio/tilzio/internal/core"
)

// App is the Wails service exposed to the frontend. Its exported methods are
// generated into TypeScript bindings (wails3 generate bindings). It is a thin
// delegate over core.Core — the daemon-ready boundary (spec §4).
type App struct {
	core core.Core
}

func NewApp(c core.Core) *App { return &App{core: c} }

// Spawn starts a shell for pane id at cwd, sized cols x rows.
func (a *App) Spawn(id string, cwd string, cols int, rows int) error {
	return a.core.Spawn(core.PaneID(id), cwd, uint16(cols), uint16(rows))
}

// Write sends keyboard input (a UTF-8 string) to the pane's shell.
func (a *App) Write(id string, data string) error {
	return a.core.Write(core.PaneID(id), []byte(data))
}

// Resize informs the pane's PTY of a new size.
func (a *App) Resize(id string, cols int, rows int) error {
	return a.core.Resize(core.PaneID(id), uint16(cols), uint16(rows))
}

// Kill terminates the pane's shell.
func (a *App) Kill(id string) error {
	return a.core.Kill(core.PaneID(id))
}

// ShellTag returns a short label for what runs in the pane (foreground process
// basename, e.g. "vitest", or the shell basename as fallback). Read-only.
func (a *App) ShellTag(id string) string {
	return a.core.ShellTag(core.PaneID(id))
}

// SaveLayout persists the frontend layout (a JSON string) via the core's
// atomic LayoutStore.
func (a *App) SaveLayout(data string) error {
	return a.core.SaveLayout([]byte(data))
}

// LoadLayout returns the persisted layout JSON string. It propagates the core's
// errors (ErrNotFound / ErrCorrupt) by rejecting the JS promise; the frontend
// falls back to a default layout on any rejection.
func (a *App) LoadLayout() (string, error) {
	b, err := a.core.LoadLayout()
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// LoadScrollback returns a pane's persisted scrollback as base64 (raw PTY bytes,
// like pty:output) so the frontend can decode and replay it byte-accurately.
func (a *App) LoadScrollback(id string) (string, error) {
	b, err := a.core.LoadScrollback(core.PaneID(id))
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(b), nil
}

// wailsEmitter implements bridge.Emitter using the running application's event
// system. application.New registers the global app, so application.Get() is
// non-nil for the rest of the process; additionally the first emit only follows
// the first Spawn, which the frontend triggers after Run serves the UI — so no
// nil-app panic is possible. Emit enqueues into the webview event loop
// (non-blocking), which matters because it is called under the batcher's mutex.
type wailsEmitter struct{}

func (wailsEmitter) Emit(name string, data any) {
	application.Get().Event.Emit(name, data)
}

var _ bridge.Emitter = wailsEmitter{}
