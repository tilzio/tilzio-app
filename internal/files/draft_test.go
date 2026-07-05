package files

import (
	"path/filepath"
	"testing"
)

func TestDraftSaveLoad(t *testing.T) {
	s := NewDraftStore(t.TempDir())
	if err := s.Save("pane-1", "/x.md", "edited"); err != nil {
		t.Fatalf("Save: %v", err)
	}
	d, found, err := s.Load("pane-1")
	if err != nil || !found {
		t.Fatalf("Load: found=%v err=%v", found, err)
	}
	if d.Path != "/x.md" || d.Content != "edited" {
		t.Fatalf("draft = %+v", d)
	}
}

func TestDraftLoadMissing(t *testing.T) {
	s := NewDraftStore(t.TempDir())
	_, found, err := s.Load("nope")
	if err != nil || found {
		t.Fatalf("found=%v err=%v", found, err)
	}
}

func TestDraftClear(t *testing.T) {
	s := NewDraftStore(t.TempDir())
	_ = s.Save("p", "/a", "x")
	if err := s.Clear("p"); err != nil {
		t.Fatalf("Clear: %v", err)
	}
	if _, found, _ := s.Load("p"); found {
		t.Fatalf("draft still present after Clear")
	}
	if err := s.Clear("p"); err != nil { // idempotent
		t.Fatalf("Clear missing: %v", err)
	}
}

func TestDraftList(t *testing.T) {
	s := NewDraftStore(t.TempDir())
	_ = s.Save("p1", "/a.md", "x")
	_ = s.Save("p2", "/b.go", "y")
	metas, err := s.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(metas) != 2 {
		t.Fatalf("len = %d, want 2", len(metas))
	}
	paths := map[string]string{}
	for _, m := range metas {
		paths[m.PaneID] = m.Path
	}
	if paths["p1"] != "/a.md" || paths["p2"] != "/b.go" {
		t.Fatalf("meta paths = %+v", paths)
	}
}

func TestDraftRejectsBadPaneID(t *testing.T) {
	s := NewDraftStore(t.TempDir())
	for _, bad := range []string{"../evil", "a/b", "", "x.y"} {
		if err := s.Save(bad, "/a", "x"); err != ErrBadPaneID {
			t.Fatalf("Save(%q) err = %v, want ErrBadPaneID", bad, err)
		}
		if _, _, err := s.Load(bad); err != ErrBadPaneID {
			t.Fatalf("Load(%q) err = %v, want ErrBadPaneID", bad, err)
		}
		if err := s.Clear(bad); err != ErrBadPaneID {
			t.Fatalf("Clear(%q) err = %v, want ErrBadPaneID", bad, err)
		}
	}
}

func TestDraftListMissingDir(t *testing.T) {
	s := NewDraftStore(filepath.Join(t.TempDir(), "nonexistent"))
	metas, err := s.List()
	if err != nil || metas != nil {
		t.Fatalf("want nil,nil got %v,%v", metas, err)
	}
}
