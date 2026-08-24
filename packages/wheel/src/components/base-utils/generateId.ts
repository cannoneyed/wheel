/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
let counter = 0;
export function generateId(prefix: string) {
  counter += 1;
  return `${prefix}-${counter}`;
}
