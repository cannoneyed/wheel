/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { asc } from './asc';

export function replaceArrayItemAtIndex(array: readonly number[], index: number, newValue: number) {
  const output = array.slice();
  output[index] = newValue;
  return output.sort(asc);
}
