// Package core implements the Tilzio session backend: PTY management,
// session lifecycle, scrollback persistence, and layout storage. It is
// designed behind the Core interface (see api.go) so it can later run as a
// standalone daemon without changing callers.
package core
