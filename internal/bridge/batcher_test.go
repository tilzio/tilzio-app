package bridge

import (
	"fmt"
	"sync"
	"testing"

	"github.com/tilzio/tilzio/internal/core"
)

type flushRec struct {
	mu    sync.Mutex
	calls []flushCall
}

type flushCall struct {
	id   core.PaneID
	data string
}

func (r *flushRec) fn(id core.PaneID, data []byte) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls = append(r.calls, flushCall{id: id, data: string(data)})
}

func (r *flushRec) snapshot() []flushCall {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]flushCall, len(r.calls))
	copy(out, r.calls)
	return out
}

func TestBatcherCoalescesUntilFlushAll(t *testing.T) {
	rec := &flushRec{}
	b := NewOutputBatcher(1<<20, rec.fn)
	b.Add("p1", []byte("ab"))
	b.Add("p1", []byte("cd"))
	if len(rec.snapshot()) != 0 {
		t.Fatalf("expected no flush before FlushAll, got %+v", rec.snapshot())
	}
	b.FlushAll()
	calls := rec.snapshot()
	if len(calls) != 1 || calls[0].id != "p1" || calls[0].data != "abcd" {
		t.Fatalf("got %+v", calls)
	}
}

func TestBatcherSizeTriggerFlushesImmediately(t *testing.T) {
	rec := &flushRec{}
	b := NewOutputBatcher(4, rec.fn)
	b.Add("p1", []byte("ab"))
	if len(rec.snapshot()) != 0 {
		t.Fatalf("not yet at cap")
	}
	b.Add("p1", []byte("cd")) // reaches 4 bytes -> immediate flush
	calls := rec.snapshot()
	if len(calls) != 1 || calls[0].data != "abcd" {
		t.Fatalf("got %+v", calls)
	}
}

func TestBatcherFlushPaneThenEmpty(t *testing.T) {
	rec := &flushRec{}
	b := NewOutputBatcher(1<<20, rec.fn)
	b.Add("p1", []byte("x"))
	b.FlushPane("p1")
	b.FlushAll() // nothing left to flush
	calls := rec.snapshot()
	if len(calls) != 1 || calls[0].data != "x" {
		t.Fatalf("got %+v", calls)
	}
}

func TestBatcherMultiPaneFlushAll(t *testing.T) {
	rec := &flushRec{}
	b := NewOutputBatcher(1<<20, rec.fn)
	b.Add("p1", []byte("one"))
	b.Add("p2", []byte("two"))
	b.FlushAll()
	if len(rec.snapshot()) != 2 {
		t.Fatalf("expected 2 flushes, got %+v", rec.snapshot())
	}
}

func TestBatcherPreservesOrderSinglePane(t *testing.T) {
	rec := &flushRec{}
	b := NewOutputBatcher(1<<20, rec.fn) // large cap: only FlushAll flushes
	var want []byte
	for i := 0; i < 100; i++ {
		chunk := []byte(fmt.Sprintf("%d,", i))
		want = append(want, chunk...)
		b.Add("p1", chunk)
	}
	b.FlushAll()
	var got []byte
	for _, c := range rec.snapshot() {
		if c.id == "p1" {
			got = append(got, []byte(c.data)...)
		}
	}
	if string(got) != string(want) {
		t.Fatalf("order/content mismatch:\n got %q\nwant %q", got, want)
	}
}

func TestBatcherConcurrentAddDistinctPanes(t *testing.T) {
	rec := &flushRec{}
	b := NewOutputBatcher(1<<20, rec.fn)
	const panes, perPane = 8, 200

	// One Add goroutine per pane (matches documented usage).
	var wg sync.WaitGroup
	for p := 0; p < panes; p++ {
		wg.Add(1)
		go func(p int) {
			defer wg.Done()
			id := core.PaneID(fmt.Sprintf("p%d", p))
			for i := 0; i < perPane; i++ {
				b.Add(id, []byte(fmt.Sprintf("%d,", i)))
			}
		}(p)
	}

	// A concurrent flusher, racing the writers.
	stop := make(chan struct{})
	var fwg sync.WaitGroup
	fwg.Add(1)
	go func() {
		defer fwg.Done()
		for {
			select {
			case <-stop:
				return
			default:
				b.FlushAll()
			}
		}
	}()

	wg.Wait()
	close(stop)
	fwg.Wait()
	b.FlushAll() // drain anything buffered after the flusher stopped

	// Expected full per-pane stream.
	var expWant []byte
	for i := 0; i < perPane; i++ {
		expWant = append(expWant, []byte(fmt.Sprintf("%d,", i))...)
	}
	got := map[core.PaneID][]byte{}
	for _, c := range rec.snapshot() {
		got[c.id] = append(got[c.id], []byte(c.data)...)
	}
	for p := 0; p < panes; p++ {
		id := core.PaneID(fmt.Sprintf("p%d", p))
		if string(got[id]) != string(expWant) {
			t.Fatalf("pane %s mismatch:\n got %q\nwant %q", id, got[id], expWant)
		}
	}
}
