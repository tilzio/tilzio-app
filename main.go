package main

import (
	"embed"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

	"github.com/tilzio/tilzio/internal/bridge"
	"github.com/tilzio/tilzio/internal/core"
	"github.com/tilzio/tilzio/internal/files"
	"github.com/tilzio/tilzio/internal/plugins"
)

//go:embed all:frontend/dist
var assets embed.FS

const (
	flushInterval = 16 * time.Millisecond // ~60fps coalescing of PTY output
	flushMaxBytes = 64 * 1024             // per-pane size trigger for burst flushes
)

func main() {
	// Wire the core behind a batched, event-emitting sink. The emitter resolves
	// the running app lazily, so building these before application.New is fine.
	sink := bridge.NewSink(wailsEmitter{}, flushMaxBytes)
	dir := dataDir()
	c, err := core.NewCore(sink, dir, "")
	if err != nil {
		log.Fatal(err)
	}

	pluginsSvc := plugins.NewService(
		filepath.Join(dir, "plugins"),
		filepath.Join(dir, "plugins.json"),
	)
	market := plugins.NewMarket(
		pluginsSvc,
		filepath.Join(dir, "store-cache.json"),
		plugins.RegistryBaseURL(),
		wailsEmitter{}.Emit,
	)
	draftStore := files.NewDraftStore(filepath.Join(dir, "drafts"))

	app := application.New(application.Options{
		Name:        "Tilzio",
		Description: "Terminal multiplexer",
		Services: []application.Service{
			application.NewService(NewApp(c)),
			application.NewService(NewPluginsApp(pluginsSvc, market)),
			application.NewService(NewFilesApp(draftStore)),
		},
		Assets: application.AssetOptions{
			Handler: NewPluginAssetHandler(pluginsSvc, application.AssetFileServerFS(assets)),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
		// Persist every live pane's scrollback before exit so a restart replays
		// real history (design §12.5). Blocks until the flush returns. Layout is
		// saved separately on the frontend (debounce + beforeunload, §6).
		OnShutdown: func() {
			if err := c.FlushAll(); err != nil {
				log.Printf("flush scrollback on shutdown: %v", err)
			}
		},
	})

	// Replace Wails' default macOS menu. Its standard items bind native key-
	// equivalents — ⌘W ("Close Window") and ⌘R ("Reload") — which macOS dispatches
	// to the menu BEFORE the webview, so a JS preventDefault can't stop them and our
	// in-app ⌘W (close pane) / ⌘R (restart pane) hotkeys would never fire. Keep the
	// App menu (⌘Q quit → OnShutdown flush), Edit (⌘C/⌘V/⌘X/⌘A clipboard for the
	// terminal) and Window; omit File (⌘W) and View (⌘R, webview zoom). Built after
	// application.New so the App-menu role can read the app name.
	menu := application.NewMenu()
	menu.AddRole(application.AppMenu)
	menu.AddRole(application.EditMenu)
	menu.AddRole(application.WindowMenu)
	app.Menu.Set(menu)

	// Drive time-based coalescing flushes for the app's lifetime. This goroutine
	// has no shutdown path by design — it ends when the process exits. FlushAll
	// is a no-op until the first pane is spawned, so starting it before Run is safe.
	go func() {
		ticker := time.NewTicker(flushInterval)
		defer ticker.Stop()
		for range ticker.C {
			sink.Batcher().FlushAll()
		}
	}()

	win := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:          "Tilzio",
		Width:          1000,
		Height:         700,
		URL:            "/",
		EnableFileDrop: true, // Drag from Finder → WindowFilesDropped (B4a, fork 5)
	})

	// A native drop in the macOS WKWebView is not dispatched to JS via Events.On —
	// only a Go-side callback (OnWindowEvent). We forward it to the frontend with
	// an explicit Emit. Pattern from the official example:
	//   examples/drag-n-drop/main.go (alpha.97)
	// API: event.Context().DroppedFiles() → []string
	//      event.Context().DropTargetDetails() → *DropTargetDetails{X,Y,ElementID,…}
	win.OnWindowEvent(events.Common.WindowFilesDropped, func(event *application.WindowEvent) {
		ctx := event.Context()
		files := ctx.DroppedFiles()
		if len(files) == 0 {
			return
		}
		details := ctx.DropTargetDetails()
		var x, y int
		if details != nil {
			x = details.X
			y = details.Y
		}
		application.Get().Event.Emit("editor:files-dropped", map[string]any{
			"files": files,
			"x":     x,
			"y":     y,
		})
	})
	// Drag from Finder entered/left the window (no coordinates) → frontend shows an overlay hint (#2).
	win.OnWindowEvent(events.Mac.WindowFileDraggingEntered, func(event *application.WindowEvent) {
		application.Get().Event.Emit("editor:drag-enter", nil)
	})
	win.OnWindowEvent(events.Mac.WindowFileDraggingExited, func(event *application.WindowEvent) {
		application.Get().Event.Emit("editor:drag-leave", nil)
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}

// dataDir returns the per-user data directory (spec §7). On macOS
// os.UserConfigDir() is ~/Library/Application Support (matches the spec). On
// Linux it yields ~/.config (the XDG config dir, not the ~/.local/share data
// dir the spec mentions) — acceptable for the macOS-focused Plan 2; revisit for
// Linux in a later plan.
func dataDir() string {
	if d, err := os.UserConfigDir(); err == nil {
		return filepath.Join(d, "Tilzio")
	}
	return filepath.Join(os.TempDir(), "Tilzio")
}
