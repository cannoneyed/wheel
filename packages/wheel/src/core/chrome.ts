/**
 * The mark that says "this element is a tool, not the app".
 *
 * Two things read it, and both would be wrong without it:
 *
 * - the annotator's hit-test, which has to look THROUGH its own shield and
 *   outline to find what you actually drew a box around;
 * - the recorder, which must never log a click on an instrument as something
 *   the app did.
 *
 * It lives in `core` rather than beside either of them because the debug dock
 * needs it too, and the layering DAG runs `annotate -> debug -> core`. That is
 * not a technicality: once the annotate composer moved INTO the dock, every
 * click in the dock — arming, picking a label, pressing save — was recorded as
 * app input, and a note's timeline filled up with the act of writing it.
 */
export const CHROME_ATTRIBUTE = 'data-wheel-chrome';

/** Selector form, for `closest()`. */
export const CHROME_SELECTOR = `[${CHROME_ATTRIBUTE}]`;

/** Spread onto any element that is instrument rather than app. */
export const chromeMark = { [CHROME_ATTRIBUTE]: '' } as const;

/** True when an element is inside something marked as chrome. */
export function insideChromeElement(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(CHROME_SELECTOR) !== null;
}
