/**
 * Pure ratio-clamp math for divider drag-resize.
 *
 * Given the pane weights captured at drag-start, the divider's `index`, and the
 * pointer movement expressed as a fraction of the container (`deltaFrac`),
 * redistribute the delta between the two adjacent panes (`index` and
 * `index + 1`) only — every other pane keeps its starting ratio. Neither pane
 * may shrink below `minFrac`: when it would, the divider "sticks" at the floor
 * and the surplus stays with the neighbour. The total of all ratios is
 * preserved.
 */
export function computeResizeRatios(
  startRatios: number[],
  index: number,
  deltaFrac: number,
  minFrac: number,
): number[] {
  let left = startRatios[index] + deltaFrac;
  let right = startRatios[index + 1] - deltaFrac;
  if (left < minFrac) {
    right -= minFrac - left;
    left = minFrac;
  }
  if (right < minFrac) {
    left -= minFrac - right;
    right = minFrac;
  }
  const ratios = [...startRatios];
  ratios[index] = left;
  ratios[index + 1] = right;
  return ratios;
}
