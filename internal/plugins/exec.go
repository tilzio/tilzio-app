package plugins

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"time"
)

// ExecResult is the captured outcome of a brokered command (design §3.1).
type ExecResult struct {
	Stdout    string `json:"stdout"`
	Stderr    string `json:"stderr"`
	Code      int    `json:"code"`
	Truncated bool   `json:"truncated"` // output hit the size cap and was clipped
}

const (
	execTimeout  = 15 * time.Second
	execMaxBytes = 1 << 20 // 1 MiB per stream (stdout/stderr)
)

// capBuffer accumulates output up to max bytes, then drops the rest and fires
// onFull (used to cancel the context → kill the child). It never returns an
// error from Write, so exec's copy goroutine keeps draining the pipe cleanly.
// stdout and stderr use SEPARATE capBuffers, each written by a single exec
// goroutine, so no internal locking is needed; onFull (context cancel) is
// idempotent.
type capBuffer struct {
	buf       bytes.Buffer
	max       int
	truncated bool
	onFull    func()
}

func (c *capBuffer) Write(p []byte) (int, error) {
	room := c.max - c.buf.Len()
	if room <= 0 {
		if !c.truncated {
			c.truncated = true
			c.onFull()
		}
		return len(p), nil // pretend-consume; drop
	}
	if len(p) > room {
		c.buf.Write(p[:room])
		c.truncated = true
		c.onFull()
		return len(p), nil
	}
	return c.buf.Write(p)
}

// runExec runs bin with args (NO shell — args passed verbatim; design §3.1) in
// cwd, capturing stdout/stderr up to maxBytes each, killing the child on timeout
// or overflow. Limits are parameters for testability; Service.Exec passes the
// execTimeout/execMaxBytes defaults. Isolated from core/PTY.
func runExec(bin string, args []string, cwd string, timeout time.Duration, maxBytes int) (ExecResult, error) {
	if maxBytes <= 0 {
		maxBytes = execMaxBytes // defensive default: a nonsensical limit → the standard cap
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Dir = cwd
	cmd.Env = os.Environ()
	out := &capBuffer{max: maxBytes, onFull: cancel}
	errb := &capBuffer{max: maxBytes, onFull: cancel}
	cmd.Stdout = out
	cmd.Stderr = errb

	runErr := cmd.Run()
	res := ExecResult{
		Stdout:    out.buf.String(),
		Stderr:    errb.buf.String(),
		Truncated: out.truncated || errb.truncated,
	}
	// Timeout wins over the resulting kill error.
	if ctx.Err() == context.DeadlineExceeded {
		return res, ErrExecTimeout
	}
	// Overflow-cancel: our own cancel() from capBuffer on overflow is an expected
	// truncation, NOT a call error (spec §3.1). os/exec may return context.Canceled
	// directly (a race during context-kill) instead of an ExitError, so we catch it
	// explicitly via the Truncated flag.
	if res.Truncated && errors.Is(ctx.Err(), context.Canceled) {
		return res, nil
	}
	if runErr != nil {
		var ee *exec.ExitError
		if errors.As(runErr, &ee) {
			res.Code = ee.ExitCode() // non-zero / signal-killed → normal result
			return res, nil
		}
		return res, runErr // e.g. binary not found
	}
	return res, nil
}
