package bridge

import (
	"bytes"
	"encoding/base64"
	"sync"
	"testing"

	"github.com/tilzio/tilzio/internal/core"
)

type fakeEmitter struct {
	mu     sync.Mutex
	events []emittedEvent
}

type emittedEvent struct {
	name string
	data any
}

func (f *fakeEmitter) Emit(name string, data any) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.events = append(f.events, emittedEvent{name: name, data: data})
}

func (f *fakeEmitter) snapshot() []emittedEvent {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]emittedEvent, len(f.events))
	copy(out, f.events)
	return out
}

func decodeOutput(t *testing.T, e emittedEvent) (id, data string) {
	t.Helper()
	if e.name != EventOutput {
		t.Fatalf("want %q event, got %q", EventOutput, e.name)
	}
	p, ok := e.data.(OutputPayload)
	if !ok {
		t.Fatalf("want OutputPayload, got %T", e.data)
	}
	raw, err := base64.StdEncoding.DecodeString(p.Chunk)
	if err != nil {
		t.Fatalf("bad base64 %q: %v", p.Chunk, err)
	}
	return p.ID, string(raw)
}

func TestSinkCoalescesUntilFlush(t *testing.T) {
	em := &fakeEmitter{}
	s := NewSink(em, 1<<20)
	s.Output("p1", []byte("foo"))
	s.Output("p1", []byte("bar"))
	if n := len(em.snapshot()); n != 0 {
		t.Fatalf("expected no events before flush, got %d", n)
	}
	s.Batcher().FlushAll()
	evs := em.snapshot()
	if len(evs) != 1 {
		t.Fatalf("expected 1 event, got %d", len(evs))
	}
	id, data := decodeOutput(t, evs[0])
	if id != "p1" || data != "foobar" {
		t.Fatalf("got id=%q data=%q", id, data)
	}
}

func TestSinkSizeTriggerFlushesImmediately(t *testing.T) {
	em := &fakeEmitter{}
	s := NewSink(em, 4)
	s.Output("p1", []byte("abcd")) // reaches maxBytes -> immediate emit
	evs := em.snapshot()
	if len(evs) != 1 {
		t.Fatalf("expected 1 event from size trigger, got %d", len(evs))
	}
	if _, data := decodeOutput(t, evs[0]); data != "abcd" {
		t.Fatalf("got %q", data)
	}
}

func TestSinkExitedFlushesPendingThenEmitsExit(t *testing.T) {
	em := &fakeEmitter{}
	s := NewSink(em, 1<<20)
	s.Output("p1", []byte("tail"))
	s.Exited("p1", 7)
	evs := em.snapshot()
	if len(evs) != 2 {
		t.Fatalf("expected 2 events (output then exit), got %d", len(evs))
	}
	if _, data := decodeOutput(t, evs[0]); data != "tail" {
		t.Fatalf("first event should flush pending output, got %q", data)
	}
	if evs[1].name != EventExited {
		t.Fatalf("second event should be %q, got %q", EventExited, evs[1].name)
	}
	p, ok := evs[1].data.(ExitedPayload)
	if !ok {
		t.Fatalf("want ExitedPayload, got %T", evs[1].data)
	}
	if p.ID != "p1" || p.Code != 7 {
		t.Fatalf("got %+v", p)
	}
}

func TestSinkImplementsOutputSink(t *testing.T) {
	var _ core.OutputSink = NewSink(&fakeEmitter{}, 1)
}

func TestSinkOutputEmitsBellOnBEL(t *testing.T) {
	em := &fakeEmitter{}
	s := NewSink(em, 1<<20)
	s.Output("p1", []byte("hi\x07there\x07")) // 2 BEL bytes
	evs := em.snapshot()
	// Expect exactly one EventBell (bell is emitted immediately, before batching)
	var bellEvs []emittedEvent
	for _, e := range evs {
		if e.name == EventBell {
			bellEvs = append(bellEvs, e)
		}
	}
	if len(bellEvs) != 1 {
		t.Fatalf("expected 1 %q event, got %d (all events: %+v)", EventBell, len(bellEvs), evs)
	}
	p, ok := bellEvs[0].data.(BellPayload)
	if !ok {
		t.Fatalf("want BellPayload, got %T", bellEvs[0].data)
	}
	if p.ID != "p1" {
		t.Fatalf("want ID=%q, got %q", "p1", p.ID)
	}
	if p.Count != 2 {
		t.Fatalf("want Count=2, got %d", p.Count)
	}
}

func TestSinkOutputNoBellWithoutBEL(t *testing.T) {
	em := &fakeEmitter{}
	s := NewSink(em, 1<<20)
	s.Output("p1", []byte("plain output"))
	evs := em.snapshot()
	for _, e := range evs {
		if e.name == EventBell {
			t.Fatalf("unexpected %q event for chunk without BEL", EventBell)
		}
	}
}

func TestCountBells(t *testing.T) {
	cases := []struct {
		name string
		in   []byte
		want int
	}{
		{"single real bell", []byte{0x07}, 1},
		{"bell in plain text", []byte("hi\x07there"), 1},
		{"osc title bel-terminated", []byte("\x1b]0;title\x07"), 0},
		{"osc cwd bel-terminated", []byte("\x1b]7;file://h/p\x07$ "), 0},
		{"osc st-terminated (ESC backslash)", []byte("\x1b]0;t\x1b\\"), 0},
		{"osc then real bell", []byte("\x1b]0;t\x07\x07"), 1},
		{"real bell then osc", []byte("\x07\x1b]0;t\x07"), 1},
		{"two prompt oscs (the 24 bug)", []byte("\x1b]0;u@h\x07\x1b]7;dir\x07$ "), 0},
		{"no bell", []byte("plain text"), 0},
		{"unterminated osc at chunk end", []byte("\x1b]0;partial"), 0},
		{"csi then bell (csi is not a string-seq)", []byte("\x1b[31m\x07"), 1},
		{"real bell after st-terminated osc", []byte("\x1b]0;t\x1b\\\x07"), 1},
		{"unterminated osc ending in lone esc", []byte("\x1b]0;t\x1b"), 0},
	}
	for _, c := range cases {
		if got := countBells(c.in); got != c.want {
			t.Errorf("%s: countBells(%q) = %d, want %d", c.name, c.in, got, c.want)
		}
	}
}

func TestSinkBase64RoundTripsBinaryBytes(t *testing.T) {
	em := &fakeEmitter{}
	s := NewSink(em, 1<<20)
	// NUL, a high byte, an ESC sequence start, and an invalid UTF-8 pair.
	raw := []byte{0x00, 0xff, 0x1b, 0x5b, 0xc3, 0x28}
	s.Output("p1", raw)
	s.Batcher().FlushAll()

	evs := em.snapshot()
	if len(evs) != 1 || evs[0].name != EventOutput {
		t.Fatalf("expected one %q event, got %+v", EventOutput, evs)
	}
	p, ok := evs[0].data.(OutputPayload)
	if !ok {
		t.Fatalf("want OutputPayload, got %T", evs[0].data)
	}
	got, err := base64.StdEncoding.DecodeString(p.Chunk)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !bytes.Equal(got, raw) {
		t.Fatalf("binary round-trip mismatch:\n got %v\nwant %v", got, raw)
	}
}
