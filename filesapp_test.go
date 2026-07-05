package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/tilzio/tilzio/internal/files"
)

func TestFilesAppReadWriteRoundTrip(t *testing.T) {
	app := NewFilesApp(files.NewDraftStore(t.TempDir()))
	p := filepath.Join(t.TempDir(), "f.md")
	if err := app.WriteFile(p, "# title"); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	got, err := app.ReadFile(p)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if got != "# title" {
		t.Fatalf("content = %q", got)
	}
}

func TestFilesAppStatFile(t *testing.T) {
	app := NewFilesApp(files.NewDraftStore(t.TempDir()))
	p := filepath.Join(t.TempDir(), "f")
	_ = os.WriteFile(p, []byte("x"), 0o644)
	if s := app.StatFile(p); !s.Exists || s.IsDir {
		t.Fatalf("stat = %+v", s)
	}
}

func TestFilesAppDraftRoundTrip(t *testing.T) {
	app := NewFilesApp(files.NewDraftStore(t.TempDir()))
	if err := app.SaveDraft("pane-1", "/x.md", "edited"); err != nil {
		t.Fatalf("SaveDraft: %v", err)
	}
	res, err := app.LoadDraft("pane-1")
	if err != nil {
		t.Fatalf("LoadDraft: %v", err)
	}
	if !res.Found || res.Path != "/x.md" || res.Content != "edited" {
		t.Fatalf("draft result = %+v", res)
	}
	if err := app.ClearDraft("pane-1"); err != nil {
		t.Fatalf("ClearDraft: %v", err)
	}
	res, _ = app.LoadDraft("pane-1")
	if res.Found {
		t.Fatalf("draft still found after ClearDraft")
	}
}
