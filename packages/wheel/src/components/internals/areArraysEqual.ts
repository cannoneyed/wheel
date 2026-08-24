/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
type ItemComparer<Item> = (a: Item, b: Item) => boolean;

export function areArraysEqual<Item>(
  array1: ReadonlyArray<Item>,
  array2: ReadonlyArray<Item>,
  itemComparer: ItemComparer<Item> = (a, b) => a === b,
) {
  return (
    array1.length === array2.length &&
    array1.every((value, index) => itemComparer(value, array2[index]))
  );
}
