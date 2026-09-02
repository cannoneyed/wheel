/**
 * Wheel's ONE "make this safe to ship" projection.
 *
 * Anything that leaves the app as data — a `window.__wheel` read crossing a
 * `page.evaluate` boundary, an annotation's recorded state transition landing
 * in a JSON file — goes through here first. It trades perfect fidelity for
 * three guarantees the callers actually need: it always returns, the result is
 * always `JSON.stringify`-able, and its size is bounded no matter what the app
 * put in the value.
 *
 * The bounds: depth 6, 100 keys or array entries per level, 500 characters per
 * string. Past a bound the value is REPLACED BY A DESCRIPTION (`<array 4000>`,
 * `…+37 more`, `…(9021 chars)`) rather than truncated silently — a reader can
 * always tell the difference between "small" and "clipped".
 *
 * Maps and Sets flatten to their contents. Functions become `<fn name>`,
 * circular references become `<circular>`; neither is followed.
 */

/** Maximum object/array nesting kept before values collapse to `<object>` / `<array N>`. */
export const SERIALIZE_DEPTH = 6;

/** Maximum keys per object (or entries per array) kept before the rest is summarized. */
export const SERIALIZE_KEYS = 100;

/** Maximum characters kept per string before the tail is replaced by a length note. */
export const SERIALIZE_STRING = 500;

/**
 * Project any value into bounded, JSON-safe data (see the module doc for the
 * bounds and how overflow is reported).
 */
export function serializeValue(
  value: unknown,
  depth = SERIALIZE_DEPTH,
  seen = new WeakSet<object>()
): unknown {
  if (value === null || value === undefined) return null;
  const type = typeof value;
  if (type === 'string') {
    const text = value as string;
    return text.length > SERIALIZE_STRING ? `${text.slice(0, SERIALIZE_STRING)}…(${text.length} chars)` : text;
  }
  if (type === 'number' || type === 'boolean') return value;
  if (type === 'bigint') return `${String(value)}n`;
  if (type === 'function') return `<fn ${(value as { name?: string }).name || 'anonymous'}>`;
  if (type !== 'object') return String(value);
  const obj = value as object;
  if (seen.has(obj)) return '<circular>';
  if (depth <= 0) return Array.isArray(obj) ? `<array ${obj.length}>` : '<object>';
  seen.add(obj);
  try {
    if (Array.isArray(obj)) {
      const head = obj.slice(0, SERIALIZE_KEYS).map((item) => serializeValue(item, depth - 1, seen));
      if (obj.length > SERIALIZE_KEYS) head.push(`…+${obj.length - SERIALIZE_KEYS} more`);
      return head;
    }
    if (obj instanceof Set) return serializeValue([...obj], depth, seen);
    if (obj instanceof Map) {
      return serializeValue(Object.fromEntries([...obj.entries()].map(([k, v]) => [String(k), v])), depth, seen);
    }
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [key, nested] of Object.entries(obj)) {
      if (count >= SERIALIZE_KEYS) {
        out['…'] = 'truncated';
        break;
      }
      out[key] = serializeValue(nested, depth - 1, seen);
      count += 1;
    }
    return out;
  } finally {
    seen.delete(obj);
  }
}
