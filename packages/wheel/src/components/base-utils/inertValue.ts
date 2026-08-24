/**
 * Returns the value to pass to an element's `inert` prop.
 *
 * Upstream's React version shims this because React < 19 doesn't recognize
 * `inert` as a DOM property and serializes booleans incorrectly. Solid has no
 * such gap: `inert` is a reflected boolean DOM attribute, and Solid's DOM
 * renderer assigns it directly to the element's `inert` IDL property. This
 * function is therefore a passthrough, kept only so call sites mirror
 * upstream's `inertValue(...)` usage 1:1.
 */
export function inertValue(value?: boolean): boolean | undefined {
  return value;
}
