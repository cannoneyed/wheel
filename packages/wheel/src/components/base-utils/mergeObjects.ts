/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
export function mergeObjects<A extends object | undefined, B extends object | undefined>(
  a: A,
  b: B,
): (A & B) | undefined {
  if (a && !b) {
    return a as A & B;
  }
  if (!a && b) {
    return b as A & B;
  }
  if (a || b) {
    return { ...a, ...b } as A & B;
  }
  return undefined;
}
