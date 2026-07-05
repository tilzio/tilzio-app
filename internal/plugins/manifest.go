package plugins

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// Manifest is a plugin's manifest.json (design §3). It is parsed and validated,
// never executed. Contributes and Permissions are opaque to the loader so new
// UI areas / permissions don't require Go changes (design §9).
type Manifest struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Version     string          `json:"version"`
	Engine      string          `json:"engine"`
	Entry       string          `json:"entry"`
	Permissions []string        `json:"permissions,omitempty"`
	Exec        []string        `json:"exec,omitempty"`
	Contributes json.RawMessage `json:"contributes,omitempty"`
}

// EngineName / EngineMajor: the only engine this build understands. The major
// must match — when the API breaks compatibility, old plugins fail cleanly.
const (
	EngineName  = "tilzio"
	EngineMajor = 1
)

var idPattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]*$`)

// ParseManifest unmarshals and validates manifest bytes. A non-nil error means
// the plugin is invalid; the message is a human-readable reason shown in the
// Extensions screen (SP-6).
func ParseManifest(data []byte) (*Manifest, error) {
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("manifest is not valid JSON: %w", err)
	}
	if err := m.Validate(); err != nil {
		return nil, err
	}
	return &m, nil
}

// Validate checks structure and engine compatibility only — not the meaning of
// permissions or contributes (those stay opaque, design §3/§9).
func (m *Manifest) Validate() error {
	if m.ID == "" {
		return fmt.Errorf("missing field: id")
	}
	if !idPattern.MatchString(m.ID) {
		return fmt.Errorf("bad id: %q (allowed: letters, digits, . _ -)", m.ID)
	}
	if m.Name == "" {
		return fmt.Errorf("missing field: name")
	}
	if m.Version == "" {
		return fmt.Errorf("missing field: version")
	}
	if m.Engine == "" {
		return fmt.Errorf("missing field: engine")
	}
	if err := checkEngine(m.Engine); err != nil {
		return err
	}
	if m.Entry == "" {
		return fmt.Errorf("missing field: entry")
	}
	if err := checkRelPath(m.Entry); err != nil {
		return fmt.Errorf("bad entry: %w", err)
	}
	for i, p := range m.Permissions {
		if p == "" {
			return fmt.Errorf("bad permissions: empty string at index %d", i)
		}
	}
	for i, b := range m.Exec {
		if b == "" {
			return fmt.Errorf("bad exec: empty string at index %d", i)
		}
	}
	if len(m.Contributes) > 0 {
		var obj map[string]json.RawMessage
		if err := json.Unmarshal(m.Contributes, &obj); err != nil {
			return fmt.Errorf("bad contributes: not a JSON object")
		}
	}
	return nil
}

// checkEngine parses "name@major" and requires tilzio@1.
func checkEngine(engine string) error {
	name, major, ok := parseEngine(engine)
	if !ok || name != EngineName || major != EngineMajor {
		return fmt.Errorf("incompatible engine: %q (want %s@%d)", engine, EngineName, EngineMajor)
	}
	return nil
}

func parseEngine(engine string) (name string, major int, ok bool) {
	at := strings.LastIndex(engine, "@")
	if at <= 0 || at == len(engine)-1 {
		return "", 0, false
	}
	major, err := strconv.Atoi(engine[at+1:])
	if err != nil {
		return "", 0, false
	}
	return engine[:at], major, true
}

// checkRelPath rejects absolute paths and any ".." traversal — a first guard;
// the actual read is secure-joined (§6).
func checkRelPath(p string) error {
	if filepath.IsAbs(p) {
		return fmt.Errorf("must be relative")
	}
	clean := filepath.ToSlash(filepath.Clean(p))
	if clean == ".." || strings.HasPrefix(clean, "../") {
		return fmt.Errorf("must stay within the plugin folder")
	}
	return nil
}
