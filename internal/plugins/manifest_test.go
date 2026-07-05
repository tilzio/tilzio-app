package plugins

import (
	"strings"
	"testing"
)

func validManifestJSON() []byte {
	return []byte(`{
		"id": "dev.term.git",
		"name": "Git",
		"version": "1.0.0",
		"engine": "tilzio@1",
		"entry": "main.js",
		"permissions": ["exec", "future:unknown"],
		"exec": ["git"],
		"contributes": {"statusBar": [{"id":"git.branch","location":"right"}]}
	}`)
}

func TestParseManifestValid(t *testing.T) {
	m, err := ParseManifest(validManifestJSON())
	if err != nil {
		t.Fatal(err)
	}
	if m.ID != "dev.term.git" || m.Name != "Git" {
		t.Fatalf("unexpected manifest: %+v", m)
	}
	// permissions/contributes are opaque: an unknown permission and an unknown
	// contribution area ("location":"right") must NOT fail validation.
	if len(m.Permissions) != 2 || m.Permissions[1] != "future:unknown" {
		t.Fatalf("permissions not preserved opaquely: %v", m.Permissions)
	}
	if len(m.Contributes) == 0 {
		t.Fatal("contributes should be preserved as raw JSON")
	}
}

func TestParseManifestErrors(t *testing.T) {
	cases := []struct {
		name string
		json string
		want string
	}{
		{"not json", `{nope`, "not valid JSON"},
		{"missing id", `{"name":"X","version":"1","engine":"tilzio@1","entry":"main.js"}`, "missing field: id"},
		{"bad id", `{"id":"a/b","name":"X","version":"1","engine":"tilzio@1","entry":"main.js"}`, "bad id"},
		{"missing name", `{"id":"a","version":"1","engine":"tilzio@1","entry":"main.js"}`, "missing field: name"},
		{"engine major", `{"id":"a","name":"X","version":"1","engine":"tilzio@2","entry":"main.js"}`, "incompatible engine"},
		{"engine garbage", `{"id":"a","name":"X","version":"1","engine":"nope","entry":"main.js"}`, "incompatible engine"},
		{"missing entry", `{"id":"a","name":"X","version":"1","engine":"tilzio@1"}`, "missing field: entry"},
		{"entry traversal", `{"id":"a","name":"X","version":"1","engine":"tilzio@1","entry":"../escape.js"}`, "bad entry"},
		{"contributes not object", `{"id":"a","name":"X","version":"1","engine":"tilzio@1","entry":"main.js","contributes":[1,2]}`, "bad contributes"},
		{"empty permission", `{"id":"a","name":"X","version":"1","engine":"tilzio@1","entry":"main.js","permissions":[""]}`, "bad permissions"},
		{"missing version", `{"id":"a","name":"X","engine":"tilzio@1","entry":"main.js"}`, "missing field: version"},
		{"empty exec", `{"id":"a","name":"X","version":"1","engine":"tilzio@1","entry":"main.js","exec":[""]}`, "bad exec"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ParseManifest([]byte(tc.json))
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tc.want)
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("error = %q, want substring %q", err.Error(), tc.want)
			}
		})
	}
}
