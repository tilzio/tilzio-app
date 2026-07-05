package plugins

import (
	"archive/zip"
	"bytes"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// makeZip builds an in-memory zip from name→content (use "/" in names for dirs).
func makeZip(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, content := range files {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatalf("zip create %q: %v", name, err)
		}
		if _, err := w.Write([]byte(content)); err != nil {
			t.Fatalf("zip write %q: %v", name, err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("zip close: %v", err)
	}
	return buf.Bytes()
}

func TestSafeUnzipNormal(t *testing.T) {
	dest := t.TempDir()
	data := makeZip(t, map[string]string{"manifest.json": "{}", "main.js": "//x"})
	if err := safeUnzip(data, dest, defaultUnzipLimits); err != nil {
		t.Fatalf("safeUnzip: %v", err)
	}
	b, err := os.ReadFile(filepath.Join(dest, "main.js"))
	if err != nil || string(b) != "//x" {
		t.Fatalf("extracted main.js wrong: %q err=%v", b, err)
	}
}

func TestSafeUnzipRejectsTraversal(t *testing.T) {
	dest := t.TempDir()
	data := makeZip(t, map[string]string{"../evil.txt": "pwned"})
	err := safeUnzip(data, dest, defaultUnzipLimits)
	if !errors.Is(err, ErrZipSlip) {
		t.Fatalf("expected ErrZipSlip, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(dest), "evil.txt")); !os.IsNotExist(err) {
		t.Fatalf("traversal file was written outside dest")
	}
}

func TestSafeUnzipRejectsTooManyFiles(t *testing.T) {
	dest := t.TempDir()
	files := map[string]string{}
	for i := 0; i < 5; i++ {
		files[string(rune('a'+i))+".txt"] = "x"
	}
	lim := unzipLimits{maxFiles: 3, maxFileBytes: 1024, maxTotalBytes: 1024}
	if err := safeUnzip(makeZip(t, files), dest, lim); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("expected ErrTooLarge, got %v", err)
	}
}

func TestSafeUnzipRejectsTotalTooBig(t *testing.T) {
	dest := t.TempDir()
	big := bytes.Repeat([]byte("a"), 2000)
	data := makeZip(t, map[string]string{"a.txt": string(big), "b.txt": string(big)})
	lim := unzipLimits{maxFiles: 100, maxFileBytes: 100000, maxTotalBytes: 3000}
	if err := safeUnzip(data, dest, lim); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("expected ErrTooLarge for total, got %v", err)
	}
}

func TestLocateManifestRootAtRoot(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "manifest.json"), []byte("{}"), 0o644)
	root, err := locateManifestRoot(dir)
	if err != nil || root != dir {
		t.Fatalf("root=%q err=%v want %q", root, err, dir)
	}
}

func TestLocateManifestRootOneSubdir(t *testing.T) {
	dir := t.TempDir()
	sub := filepath.Join(dir, "plugin-1.0")
	os.MkdirAll(sub, 0o755)
	os.WriteFile(filepath.Join(sub, "manifest.json"), []byte("{}"), 0o644)
	root, err := locateManifestRoot(dir)
	if err != nil || root != sub {
		t.Fatalf("root=%q err=%v want %q", root, err, sub)
	}
}

func TestLocateManifestRootMissing(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "readme.txt"), []byte("x"), 0o644)
	if _, err := locateManifestRoot(dir); !errors.Is(err, ErrNoManifest) {
		t.Fatalf("expected ErrNoManifest, got %v", err)
	}
}

func TestDownloadRejectsNonHTTPS(t *testing.T) {
	if _, err := download("http://example.com/x.zip", 1024, time.Second); !errors.Is(err, ErrInsecureURL) {
		t.Fatalf("expected ErrInsecureURL, got %v", err)
	}
	if _, err := download("ftp://example.com/x.zip", 1024, time.Second); !errors.Is(err, ErrInsecureURL) {
		t.Fatalf("expected ErrInsecureURL for ftp, got %v", err)
	}
}

func TestDownloadHTTPSAndLimit(t *testing.T) {
	body := bytes.Repeat([]byte("z"), 5000)
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write(body)
	}))
	defer srv.Close()
	got, err := downloadWith(srv.Client(), srv.URL, 10000)
	if err != nil || len(got) != 5000 {
		t.Fatalf("download len=%d err=%v", len(got), err)
	}
	if _, err := downloadWith(srv.Client(), srv.URL, 1000); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("expected ErrTooLarge, got %v", err)
	}
}
