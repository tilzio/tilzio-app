/**
 * Pure ratio-clamp math for divider drag-resize.
 *
 * Given the pane weights captured at drag-start, the divider's `index`, and the
 * pointer movement expressed as a fraction of the container (`deltaFrac`),
 * redistribute the delta between the two adjacent panes (`index` and
 * `index + 1`) only — every other pane keeps its starting ratio. Neither pane
 * may shrink below `minFrac`: when it would, the divider "sticks" at the floor
 * and the surplus stays with the neighbour. When the pair's combined share
 * cannot satisfy both floors (< 2*minFrac) the drag is a no-op — the previous
 * ratios are kept (a sequential double-clamp would overshoot into negatives).
 * The total of all ratios is preserved.
 */
export function computeResizeRatios(
  startRatios: number[],
  index: number,
  deltaFrac: number,
  minFrac: number,
): number[] {
  const pair = startRatios[index] + startRatios[index + 1];
  if (pair < 2 * minFrac) return [...startRatios]; // both floors unsatisfiable → no-op
  // Clamp the moving edge into [minFrac, pair - minFrac]; the neighbour gets the rest.
  const left = Math.min(pair - minFrac, Math.max(minFrac, startRatios[index] + deltaFrac));
  const ratios = [...startRatios];
  ratios[index] = left;
  ratios[index + 1] = pair - left;
  return ratios;
}
