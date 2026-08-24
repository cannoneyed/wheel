/**
 * Serializes an arbitrary value (Radio's generic `value` prop) into a string
 * suitable for a native `<input value>` attribute.
 * Solid port of upstream's `serializeValue`.
 */
export function serializeValue(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
