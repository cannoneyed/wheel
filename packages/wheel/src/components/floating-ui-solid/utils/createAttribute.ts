/**
 * Solid port of upstream's `createAttribute` (framework-neutral, ported
 * as-is).
 */
export function createAttribute(name: string) {
  return `data-base-ui-${name}`;
}
