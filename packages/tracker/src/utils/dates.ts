/**
 * Date display helpers. Callers pass their presentation-time clock read, so
 * tests can pin every label without creating a ticking domain-clock service.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format an ISO date (YYYY-MM-DD) as `Jul 24`. */
export function formatDueDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-').map(Number);
  return `${MONTHS[(month ?? 1) - 1]} ${day ?? 1}`;
}

/** Compact relative time for feeds ("just now", "5m", "3h", "2d", "Jul 4"). */
export function formatRelativeTime(epochMs: number, nowMs: number): string {
  const delta = nowMs - epochMs;
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  if (delta < 14 * 86_400_000) return `${Math.floor(delta / 86_400_000)}d`;
  const date = new Date(epochMs);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** Whether an ISO due date is strictly before today (local time). */
export function isOverdue(isoDate: string, nowMs: number): boolean {
  const today = new Date(nowMs);
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;
  return isoDate < todayIso;
}
