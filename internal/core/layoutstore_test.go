package core

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestLayoutSaveLoad(t *testing.T) {
	p := filepath.Join(t.TempDir(), "layout.json")
	ls := NewLayoutStore(p)
	want := []byte(`{"activeSpaceId":"s1"}`)
	if err := ls.Save(want); err != nil {
		t.Fatal(err)
	}
	got, err := ls.Load()
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(want) {
		t.Fatalf("got %q", got)
	}
}

// Concurrent saves must serialize: unsynchronized writers share one fixed .tmp
// path, so interleaved WriteFile/Rename could persist a mixed/corrupt layout.
// With the mutex, the stored file is always exactly one complete payload.
func TestLayoutSaveConcurrentStaysWhole(t *testing.T) {
	p := filepath.Join(t.TempDir(), "layout.json")
	ls := NewLayoutStore(p)
	payloads := make([]string, 8)
	for i := range payloads {
		payloads[i] = fmt.Sprintf(`{"i":%d,"pad":%q}`, i, strings.Repeat("x", 4096))
	}
	for iter := 0; iter < 5; iter++ {
		var wg sync.WaitGroup
		for _, pl := range payloads {
			wg.Add(1)
			go func(b string) {
				defer wg.Done()
				if err := ls.Save([]byte(b)); err != nil {
					t.Errorf("Save: %v", err)
				}
			}(pl)
		}
		wg.Wait()
		got, err := ls.Load()
		if err != nil {
			t.Fatalf("iter %d: Load after concurrent saves: %v", iter, err)
		}
		found := false
		for _, pl := range payloads {
			if string(got) == pl {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("iter %d: stored layout is not any complete payload (interleaved write)", iter)
		}
	}
}

func TestLayoutLoadMissing(t *testing.T) {
	ls := NewLayoutStore(filepath.Join(t.TempDir(), "layout.json"))
	if _, err := ls.Load(); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}

func TestLayoutLoadCorruptBacksUp(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "layout.json")
	if err := os.WriteFile(p, []byte("{not json"), 0o644); err != nil {
		t.Fatal(err)
	}
	ls := NewLayoutStore(p)
	if _, err := ls.Load(); !errors.Is(err, ErrCorrupt) {
		t.Fatalf("want ErrCorrupt, got %v", err)
	}
	if _, err := os.Stat(p); !os.IsNotExist(err) {
		t.Fatalf("expected original moved aside, stat err=%v", err)
	}
	matches, _ := filepath.Glob(p + ".corrupt-*")
	if len(matches) == 0 {
		t.Fatalf("expected a .corrupt-* backup file")
	}
}
