// Pure helpers for split shares (Split.ratio). Used by reducers for the rule
// "equalize only the zones that are already equal to one another".

// The shares are equal to one another (with a float tolerance).
export function allEqual(ratio: number[], eps = 1e-6): boolean {
  if (ratio.length <= 1) return true;
  return Math.max(...ratio) - Math.min(...ratio) < eps;
}

// N equal shares (as the newSplit default). Sum ≈ 1; flex-grow uses them as
// relative coefficients, so a tiny float error in the sum is harmless.
export function equalRatio(n: number): number[] {
  return Array.from({ length: n }, () => 1 / n);
}
