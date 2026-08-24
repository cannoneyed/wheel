/** Priority vocabulary shared by rows, pickers, and sorting. */

/** One priority level's display data. */
export interface PriorityDef {
  readonly value: number;
  readonly label: string;
  readonly icon: string;
}

/** All priorities in picker order: none, urgent, high, medium, low. */
export const PRIORITIES: readonly PriorityDef[] = [
  { value: 0, label: 'No priority', icon: '—' },
  { value: 1, label: 'Urgent', icon: '⚠' },
  { value: 2, label: 'High', icon: '↑' },
  { value: 3, label: 'Medium', icon: '›' },
  { value: 4, label: 'Low', icon: '↓' }
];

/** Display data for a priority value (falls back to "No priority"). */
export function priorityDef(value: number): PriorityDef {
  return PRIORITIES.find((priority) => priority.value === value) ?? PRIORITIES[0];
}

/** Sort rank: urgent → high → medium → low → none. */
export function priorityRank(value: number): number {
  return value === 0 ? 5 : value;
}

/** Estimate options offered by the estimate picker (0 clears). */
export const ESTIMATES: readonly number[] = [0, 1, 2, 3, 5, 8];
