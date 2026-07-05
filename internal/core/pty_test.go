package core

import (
	"bytes"
	"sync"
	"testing"
	"time"
)

// readUntilPty reads from p in a background goroutine and fails the test if
// want is not seen within timeout.
func readUntilPty(t *testing.T, p *Pty, want string, timeout time.Duration) {
	t.Helper()
	var (
		mu  sync.Mutex
		acc []byte
	)
	done := make(chan struct{})
	go func() {
		defer close(done)
		buf := make([]byte, 4096)
		for {
			n, err := p.Read(buf)
			if n > 0 {
				mu.Lock()
				acc = append(acc, buf[:n]...)
				mu.Unlock()
			}
			if err != nil {
				return
			}
		}
	}()
	t.Cleanup(func() { <-done })
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		mu.Lock()
		hit := bytes.Contains(acc, []byte(want))
		mu.Unlock()
		if hit {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	mu.Lock()
	got := string(acc)
	mu.Unlock()
	t.Fatalf("timeout waiting for %q; got %q", want, got)
}

func TestPtyEchoesInput(t *testing.T) {
	p, err := OpenPty("/bin/sh", "", 80, 24)
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	if _, err := p.Write([]byte("echo tilzio_ok\n")); err != nil {
		t.Fatal(err)
	}
	readUntilPty(t, p, "tilzio_ok", 5*time.Second)
}

func TestPtyResizeNoError(t *testing.T) {
	p, err := OpenPty("/bin/sh", "", 80, 24)
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	if err := p.Resize(120, 40); err != nil {
		t.Fatalf("resize: %v", err)
	}
}

func TestPtyWaitIdempotent(t *testing.T) {
	p, err := OpenPty("/bin/sh", "", 80, 24)
	if err != nil {
		t.Fatal(err)
	}
	// Drain output in the background so the shell never blocks on writes.
	go func() {
		buf := make([]byte, 4096)
		for {
			if _, err := p.Read(buf); err != nil {
				return
			}
		}
	}()
	if _, err := p.Write([]byte("exit 0\n")); err != nil {
		t.Fatal(err)
	}
	if err := p.Wait(); err != nil {
		t.Fatalf("first Wait: %v", err)
	}
	if err := p.Wait(); err != nil {
		t.Fatalf("second Wait must be idempotent (nil), got %v", err)
	}
}

func TestPtyCloseIdempotent(t *testing.T) {
	p, err := OpenPty("/bin/sh", "", 80, 24)
	if err != nil {
		t.Fatal(err)
	}
	if err := p.Close(); err != nil {
		t.Fatalf("first close: %v", err)
	}
	if err := p.Close(); err != nil {
		t.Fatalf("second close should be nil, got %v", err)
	}
}
