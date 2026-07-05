package plugins

import (
	"errors"
	"testing"
	"time"
)

func TestRunExecEchoStdout(t *testing.T) {
	res, err := runExec("echo", []string{"hi"}, "", execTimeout, execMaxBytes)
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if res.Stdout != "hi\n" || res.Code != 0 || res.Truncated {
		t.Fatalf("got %+v", res)
	}
}

func TestRunExecExitCode(t *testing.T) {
	// `false` exits 1 — a non-zero code is a normal result, not a Go error.
	res, err := runExec("false", nil, "", execTimeout, execMaxBytes)
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if res.Code != 1 {
		t.Fatalf("code=%d", res.Code)
	}
}

func TestRunExecTimeout(t *testing.T) {
	_, err := runExec("sleep", []string{"30"}, "", 50*time.Millisecond, execMaxBytes)
	if !errors.Is(err, ErrExecTimeout) {
		t.Fatalf("err=%v", err)
	}
}

func TestRunExecCapTruncates(t *testing.T) {
	// `yes` spews "y\n" forever; a small cap forces truncation + kills the child.
	// Loop: overflow-cancel can surface as context.Canceled from os/exec (race) —
	// the result must still be err==nil with Truncated=true, NOT a call error (C1).
	for i := 0; i < 50; i++ {
		res, err := runExec("yes", nil, "", execTimeout, 1024)
		if err != nil {
			t.Fatalf("iter %d: unexpected err=%v (overflow must not error)", i, err)
		}
		if !res.Truncated {
			t.Fatalf("iter %d: expected Truncated", i)
		}
		if len(res.Stdout) > 1024 {
			t.Fatalf("iter %d: stdout len=%d > cap", i, len(res.Stdout))
		}
	}
}

func TestRunExecNoShell(t *testing.T) {
	// Shell metachars are literal args, NOT interpreted (no sh -c): echo prints
	// them verbatim; no command substitution / chaining occurs.
	res, err := runExec("echo", []string{"; rm -rf /", "$(whoami)"}, "", execTimeout, execMaxBytes)
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if res.Stdout != "; rm -rf / $(whoami)\n" {
		t.Fatalf("stdout=%q (shell must NOT interpret)", res.Stdout)
	}
}
