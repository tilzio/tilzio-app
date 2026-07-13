package core

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"

	"github.com/creack/pty"
	"golang.org/x/sys/unix"
)

// Pty wraps a shell process attached to a pseudo-terminal master.
type Pty struct {
	f    *os.File
	cmd  *exec.Cmd
	once sync.Once
	werr error
}

func defaultShell() string {
	if s := os.Getenv("SHELL"); s != "" {
		return s
	}
	return "/bin/sh"
}

// OpenPty starts shell (or the user's $SHELL if empty) in cwd, attached to a
// new PTY sized cols x rows.
func OpenPty(shell, cwd string, cols, rows uint16) (*Pty, error) {
	if shell == "" {
		shell = defaultShell()
	}
	cmd := exec.Command(shell)
	if cwd != "" {
		cmd.Dir = cwd
	}
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")
	f, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: rows, Cols: cols})
	if err != nil {
		return nil, err
	}
	return &Pty{f: f, cmd: cmd}, nil
}

func (p *Pty) Read(b []byte) (int, error)  { return p.f.Read(b) }
func (p *Pty) Write(b []byte) (int, error) { return p.f.Write(b) }

// ForegroundName returns the basename of the process currently in the
// foreground process group of this PTY (e.g. "vitest", "node", "vim"), or "" if
// it cannot be determined. READ-ONLY (§9): TIOCGPGRP on the master fd → pid →
// basename via `ps -o comm=`; no spawn/kill/scrollback. Any error or empty
// output → "" (the caller falls back to the shell basename).
func (p *Pty) ForegroundName() string {
	if p.f == nil {
		return ""
	}
	// TIOCGPGRP on the master fd returns the pgid of the session's foreground group.
	pgrp, err := unix.IoctlGetInt(int(p.f.Fd()), unix.TIOCGPGRP)
	if err != nil || pgrp <= 0 {
		return ""
	}
	// `ps -o comm=` prints only the command name (no header) for the pid.
	out, err := exec.Command("ps", "-o", "comm=", "-p", strconv.Itoa(pgrp)).Output()
	if err != nil {
		return ""
	}
	name := strings.TrimSpace(string(out))
	if name == "" {
		return ""
	}
	return filepath.Base(name)
}

func (p *Pty) Resize(cols, rows uint16) error {
	return pty.Setsize(p.f, &pty.Winsize{Rows: rows, Cols: cols})
}

// Wait blocks until the shell process exits and returns its exit error (nil on
// clean exit). Safe to call multiple times; subsequent calls return the cached
// result.
func (p *Pty) Wait() error {
	p.once.Do(func() { p.werr = p.cmd.Wait() })
	return p.werr
}

// ForceKill SIGKILLs the shell's whole process group — the escalation path for
// a child that ignored the SIGHUP hangup. The child is a session leader
// (creack/pty starts it with Setsid), so pid == pgid and grandchildren die with
// it. The Signal(0) probe goes through os.Process's reap guard, so a process
// already reaped by Wait is never re-signalled (no pid-reuse kill).
func (p *Pty) ForceKill() error {
	proc := p.cmd.Process
	if proc == nil {
		return nil
	}
	if err := proc.Signal(syscall.Signal(0)); err != nil {
		return nil // already exited / reaped
	}
	if err := syscall.Kill(-proc.Pid, syscall.SIGKILL); err != nil {
		return proc.Kill() // fallback: at least the direct child
	}
	return nil
}

// Close hangs up the shell with SIGHUP (the conventional "terminal closed"
// signal, which lets the shell save history and run cleanup) and closes the
// PTY master. Idempotent: a second call is a no-op.
func (p *Pty) Close() error {
	if p.cmd.Process != nil {
		_ = p.cmd.Process.Signal(syscall.SIGHUP)
	}
	if err := p.f.Close(); err != nil && !errors.Is(err, os.ErrClosed) {
		return err
	}
	return nil
}
