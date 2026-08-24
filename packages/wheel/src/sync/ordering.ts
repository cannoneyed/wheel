/**
 * The blessed ordering model for user-reorderable collections: `position` is
 * a float SORT KEY, not a list index — only relative order matters, and the
 * values are expected to look weird (negative at the top, fractional between
 * rows). The payoff: a reorder is always ONE row write, so concurrent moves
 * of different rows compose instead of conflicting. See the todo demo sync module
 * for the full rationale (including the rejected order-array alternative).
 *
 * Known limit: float midpoints exhaust after ~50 drops into the same gap;
 * the editor app upgrades to string fractional indexes (same shape).
 */
/** Midpoint sort key between two neighbors (undefined = list edge) - a reorder writes exactly one row. */
export function positionBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 0;
  if (before === undefined) return after! - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}
