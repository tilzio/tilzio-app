package plugins

import "errors"

// ErrNotFound is returned for operations on an unknown plugin id or a missing
// storage key.
var ErrNotFound = errors.New("plugins: not found")

// ErrQuotaExceeded is returned when a StorageSet would exceed a plugin's storage
// quota (MaxStorageBytes).
var ErrQuotaExceeded = errors.New("plugins: storage quota exceeded")

// ErrExecNotAllowed is returned when a plugin tries to exec a binary that is not
// in its manifest's exec allow-list (design §3.2, SP-5).
var ErrExecNotAllowed = errors.New("plugins: exec binary not in allow-list")

// ErrExecTimeout is returned when a brokered exec exceeds its timeout (design §3.1).
var ErrExecTimeout = errors.New("plugins: exec timed out")

// ErrBadArchive — the archive cannot be read as a zip (plugin installation).
var ErrBadArchive = errors.New("plugins: bad archive")

// ErrZipSlip — an archive entry tries to escape the target folder
// (path traversal / absolute path / non-regular file).
var ErrZipSlip = errors.New("plugins: archive entry escapes target")

// ErrTooLarge — the archive/file/download exceeds the limit (zip-bomb guard).
var ErrTooLarge = errors.New("plugins: too large")

// ErrNoManifest — the archive has no manifest.json (neither at the root nor in a single folder).
var ErrNoManifest = errors.New("plugins: manifest.json not found in archive")

// ErrInsecureURL — the install URL is not https.
var ErrInsecureURL = errors.New("plugins: install URL must be https")

// ErrDownload — failed to download the archive from the URL.
var ErrDownload = errors.New("plugins: download failed")
