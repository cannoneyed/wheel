/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/**
 * Hides the viewport's native scrollbar so only the custom `ScrollArea.Thumb` is visible,
 * while keeping the element scrollable (`overflow: scroll`) for wheel/touch/keyboard input
 * and native momentum scrolling.
 *
 * Deviation: upstream injects this CSS via a CSP-aware `<style nonce>` element backed by
 * `useCSPContext` (`disableStyleElements`/`nonce`), rendered once per mounted `ScrollArea.Root`
 * and deduplicated by React 19's `<style href precedence>` hoisting. No CSP context exists in
 * this Solid port yet (see `SelectPopup.tsx`'s identical deviation note for `Select`), and Solid
 * has no equivalent style-hoisting/dedup mechanism, so this port instead lazily injects a single
 * `<style>` element into the owner document's `<head>` the first time a viewport mounts (guarded
 * by element id so multiple scroll areas — even across separate documents/iframes — never
 * duplicate it), without CSP nonce support.
 */
const DISABLE_SCROLLBAR_CLASS_NAME = 'base-ui-disable-scrollbar';
const STYLE_ELEMENT_ID = 'base-ui-scroll-area-disable-scrollbar-style';

export const styleDisableScrollbar = {
  className: DISABLE_SCROLLBAR_CLASS_NAME,
  ensureInjected(doc: Document | null | undefined) {
    if (!doc || doc.getElementById(STYLE_ELEMENT_ID)) {
      return;
    }

    const style = doc.createElement('style');
    style.id = STYLE_ELEMENT_ID;
    style.textContent = `.${DISABLE_SCROLLBAR_CLASS_NAME}{scrollbar-width:none}.${DISABLE_SCROLLBAR_CLASS_NAME}::-webkit-scrollbar{display:none}`;
    doc.head.appendChild(style);
  },
};
