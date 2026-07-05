package plugins

import (
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"testing"
)

func TestStorageRoundTrip(t *testing.T) {
	p := filepath.Join(t.TempDir(), "plugins.json")
	s := NewPluginStore(p)
	if err := s.StorageSet("a", "branch", json.RawMessage(`"main"`)); err != nil {
		t.Fatal(err)
	}
	s2 := NewPluginStore(p)
	v, err := s2.StorageGet("a", "branch")
	if err != nil {
		t.Fatal(err)
	}
	if string(v) != `"main"` {
		t.Fatalf("got %s", v)
	}
}

func TestStorageGetMissing(t *testing.T) {
	s := NewPluginStore(filepath.Join(t.TempDir(), "plugins.json"))
	if _, err := s.StorageGet("a", "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}

func TestStorageQuota(t *testing.T) {
	s := NewPluginStore(filepath.Join(t.TempDir(), "plugins.json"))
	big := json.RawMessage(`"` + strings.Repeat("x", MaxStorageBytes) + `"`)
	if err := s.StorageSet("a", "k", big); !errors.Is(err, ErrQuotaExceeded) {
		t.Fatalf("want ErrQuotaExceeded, got %v", err)
	}
	// Rejected write must not persist.
	if _, err := s.StorageGet("a", "k"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("rejected write should not be stored, got err=%v", err)
	}
}

func TestStorageSetInvalidJSON(t *testing.T) {
	s := NewPluginStore(filepath.Join(t.TempDir(), "plugins.json"))
	if err := s.StorageSet("a", "k", json.RawMessage(`{bad`)); err == nil {
		t.Fatal("expected error for invalid JSON value")
	}
}

func TestStorageOverwriteShrink(t *testing.T) {
	p := filepath.Join(t.TempDir(), "plugins.json")
	s := NewPluginStore(p)
	if err := s.StorageSet("a", "k", json.RawMessage(`"a long-ish value"`)); err != nil {
		t.Fatal(err)
	}
	// Overwriting an existing key with a smaller value must succeed and persist.
	if err := s.StorageSet("a", "k", json.RawMessage(`"x"`)); err != nil {
		t.Fatal(err)
	}
	v, err := s.StorageGet("a", "k")
	if err != nil || string(v) != `"x"` {
		t.Fatalf("v=%s err=%v", v, err)
	}
}

func TestStorageGetCompactsValue(t *testing.T) {
	p := filepath.Join(t.TempDir(), "plugins.json")
	s := NewPluginStore(p)
	// Store a value carrying incidental whitespace; StorageGet must return it as
	// canonical compact JSON.
	if err := s.StorageSet("a", "k", json.RawMessage(`{ "n" : 1 }`)); err != nil {
		t.Fatal(err)
	}
	v, err := s.StorageGet("a", "k")
	if err != nil {
		t.Fatal(err)
	}
	if string(v) != `{"n":1}` {
		t.Fatalf("StorageGet should return compact JSON, got %s", v)
	}
}
