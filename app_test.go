package main

import "testing"

// Spawn/Resize receive JS numbers as int; a silent cast to uint16 would wrap
// (-1 → 65535, 65536 → 0). clampDim bounds them to the PTY's valid range.
func TestClampDim(t *testing.T) {
	cases := []struct {
		in   int
		want uint16
	}{
		{-1, 1},
		{0, 1},
		{1, 1},
		{2, 2},
		{80, 80},
		{65535, 65535},
		{65536, 65535},
		{1 << 20, 65535},
	}
	for _, c := range cases {
		if got := clampDim(c.in); got != c.want {
			t.Errorf("clampDim(%d) = %d, want %d", c.in, got, c.want)
		}
	}
}
