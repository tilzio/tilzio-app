package plugins

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// unzipLimits bounds an installed archive to defeat zip-bombs.
type unzipLimits struct {
	maxFiles      int
	maxFileBytes  int64
	maxTotalBytes int64
}

var defaultUnzipLimits = unzipLimits{maxFiles: 2000, maxFileBytes: 10 * 1024 * 1024, maxTotalBytes: 50 * 1024 * 1024}

// safeUnzip extracts the zip in data into destDir (which must exist), refusing any
// entry that would escape destDir (zip-slip: traversal, absolute paths, or
// non-regular entries like symlinks) and enforcing zip-bomb limits. On any error
// the caller discards destDir, so partial extraction is harmless.
func safeUnzip(data []byte, destDir string, lim unzipLimits) error {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return fmt.Errorf("%w: %v", ErrBadArchive, err)
	}
	if len(zr.File) > lim.maxFiles {
		return fmt.Errorf("%w: too many files (%d > %d)", ErrTooLarge, len(zr.File), lim.maxFiles)
	}
	destAbs, err := filepath.Abs(destDir)
	if err != nil {
		return err
	}
	var total int64
	for _, f := range zr.File {
		target := filepath.Join(destAbs, f.Name)
		// zip-slip: the cleaned target must stay within destAbs.
		if target != destAbs && !strings.HasPrefix(target, destAbs+string(os.PathSeparator)) {
			return fmt.Errorf("%w: %q", ErrZipSlip, f.Name)
		}
		info := f.FileInfo()
		if info.IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}
		// Reject symlinks/devices: a symlink could later redirect a read outside.
		if !info.Mode().IsRegular() {
			return fmt.Errorf("%w: non-regular entry %q", ErrZipSlip, f.Name)
		}
		// Pre-check on the declared size is a fast reject; the real guard is the
		// actual byte count below (a header can lie: declare small, stream big).
		if info.Size() > lim.maxFileBytes {
			return fmt.Errorf("%w: %q exceeds per-file limit", ErrTooLarge, f.Name)
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		n, err := extractFile(f, target, lim.maxFileBytes)
		if err != nil {
			return err
		}
		// Accumulate ACTUAL extracted bytes — defends a zip-bomb of many mid-sized
		// files whose headers under-report size (matters for untrusted URL installs).
		total += n
		if total > lim.maxTotalBytes {
			return fmt.Errorf("%w: archive expands beyond %d bytes", ErrTooLarge, lim.maxTotalBytes)
		}
	}
	return nil
}

// locateManifestRoot finds the directory holding manifest.json: either dir itself,
// or its single subdirectory (the common "zip wraps one folder" case). Otherwise
// ErrNoManifest.
func locateManifestRoot(dir string) (string, error) {
	if fileExists(filepath.Join(dir, "manifest.json")) {
		return dir, nil
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", err
	}
	var sub string
	subdirs := 0
	for _, e := range entries {
		if e.IsDir() {
			subdirs++
			sub = filepath.Join(dir, e.Name())
		}
	}
	if subdirs == 1 && fileExists(filepath.Join(sub, "manifest.json")) {
		return sub, nil
	}
	return "", ErrNoManifest
}

func fileExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && info.Mode().IsRegular()
}

const (
	installMaxBytes   = 50 * 1024 * 1024 // download/zip size cap
	installDownloadTO = 30 * time.Second
)

// download fetches an https URL into memory, capped at maxBytes. Non-https → ErrInsecureURL.
func download(rawURL string, maxBytes int64, timeout time.Duration) ([]byte, error) {
	client := &http.Client{
		Timeout: timeout,
		// Enforce https across redirects too: a 301 → http:// must not downgrade
		// past the scheme check (the initial check only covers the first URL).
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if req.URL.Scheme != "https" {
				return ErrInsecureURL
			}
			return nil
		},
	}
	return downloadWith(client, rawURL, maxBytes)
}

// downloadWith is download with an injectable client (test seam for a TLS test
// server). The client carries its own timeout / redirect policy.
func downloadWith(client *http.Client, rawURL string, maxBytes int64) ([]byte, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDownload, err)
	}
	if u.Scheme != "https" {
		return nil, ErrInsecureURL
	}
	resp, err := client.Get(rawURL)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDownload, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: status %d", ErrDownload, resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxBytes+1))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDownload, err)
	}
	if int64(len(data)) > maxBytes {
		return nil, fmt.Errorf("%w: download exceeds %d bytes", ErrTooLarge, maxBytes)
	}
	return data, nil
}

// extractFile writes one zip entry to target, capping the copy at maxBytes+1 as a
// belt-and-suspenders against a header that lies about its size. Returns the actual
// number of bytes written (for the caller's running total).
func extractFile(f *zip.File, target string, maxBytes int64) (int64, error) {
	rc, err := f.Open()
	if err != nil {
		return 0, err
	}
	defer rc.Close()
	out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return 0, err
	}
	defer out.Close()
	n, err := io.Copy(out, io.LimitReader(rc, maxBytes+1))
	if err != nil {
		return n, err
	}
	if n > maxBytes {
		return n, fmt.Errorf("%w: entry body exceeds per-file limit", ErrTooLarge)
	}
	return n, nil
}
