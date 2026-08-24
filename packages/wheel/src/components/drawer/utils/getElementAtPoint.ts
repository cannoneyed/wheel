/**
 * Solid port of upstream's `utils/getElementAtPoint.ts`. Framework-neutral; ported unchanged.
 */
export function getElementAtPoint(doc: Document | null | undefined, x: number, y: number) {
  return typeof doc?.elementFromPoint === 'function' ? doc.elementFromPoint(x, y) : null;
}
