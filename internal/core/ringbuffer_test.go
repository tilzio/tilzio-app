package core

import (
	"bytes"
	"testing"
)

func TestRingBufferKeepsTailWithinCap(t *testing.T) {
	rb := NewRingBuffer(4)
	rb.Append([]byte("ab"))
	rb.Append([]byte("cdef"))
	if got := rb.Snapshot(); string(got) != "cdef" {
		t.Fatalf("want %q, got %q", "cdef", got)
	}
}

func TestRingBufferUnderCap(t *testing.T) {
	rb := NewRingBuffer(16)
	rb.Append([]byte("hello"))
	if got := rb.Snapshot(); !bytes.Equal(got, []byte("hello")) {
		t.Fatalf("want hello, got %q", got)
	}
}
