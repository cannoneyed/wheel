/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
export { getWindow as ownerWindow } from '@floating-ui/utils/dom';

export function ownerDocument(node: Element | null | undefined) {
  return node?.ownerDocument || document;
}
