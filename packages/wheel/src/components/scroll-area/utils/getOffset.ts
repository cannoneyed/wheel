/**
 * Solid port of upstream's `scroll-area/utils/getOffset.ts` — framework-neutral, ported
 * unchanged.
 */
export function getOffset(
  element: Element | null,
  prop: 'margin' | 'padding',
  axis: 'x' | 'y',
): number {
  if (!element) {
    return 0;
  }

  const styles = getComputedStyle(element);
  const propAxis = axis === 'x' ? 'Inline' : 'Block';

  // Safari misreports `marginInlineEnd` in RTL.
  // We have to assume the start/end values are symmetrical, which is likely.
  if (axis === 'x' && prop === 'margin') {
    return parseFloat(styles[`${prop}InlineStart` as keyof CSSStyleDeclaration] as string) * 2;
  }

  return (
    parseFloat(styles[`${prop}${propAxis}Start` as keyof CSSStyleDeclaration] as string) +
    parseFloat(styles[`${prop}${propAxis}End` as keyof CSSStyleDeclaration] as string)
  );
}
