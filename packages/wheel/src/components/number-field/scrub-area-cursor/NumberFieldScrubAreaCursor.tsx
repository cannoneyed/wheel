/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-tracked-show -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { Show, splitProps, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { platform } from '../../base-utils/platform/index';
import { useNumberFieldRootContext } from '../root/NumberFieldRootContext';
import type { BaseUIComponentProps } from '../../internals/types';
import type { NumberFieldRootState } from '../root/NumberFieldRoot';
import { stateAttributesMapping } from '../utils/stateAttributesMapping';
import { useNumberFieldScrubAreaContext } from '../scrub-area/NumberFieldScrubAreaContext';
import { renderElement } from '../../internals/renderElement';

const CURSOR_STYLE = {
  position: 'fixed',
  top: '0',
  left: '0',
  'pointer-events': 'none',
} as const;

/**
 * A custom element to display instead of the native cursor while using the scrub area.
 * Renders a `<span>` element.
 *
 * This component uses the [Pointer Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API), which may prompt the browser to display a related notification. It is disabled
 * in Safari to avoid a layout shift that this notification causes there.
 *
 * Documentation: [Base UI Number Field](https://base-ui.com/react/components/number-field)
 *
 * Deviation: upstream computes the portal container from the cursor element's own
 * `ownerDocument` once it mounts (`ReactDOM.createPortal(element, ownerDocument(domElement).body)`),
 * correcting a same-document default on a second render if the element turns out to live in a
 * different document (e.g. inside an iframe/shadow root). Solid's `Portal` needs its `mount`
 * target resolved before the portaled content is created, so that self-correcting two-pass trick
 * has no direct equivalent here; this mounts to the global `document.body` unconditionally, which
 * covers the overwhelming common case of a single-document host.
 */
export function NumberFieldScrubAreaCursor(
  componentProps: NumberFieldScrubAreaCursor.Props,
): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
  ]);

  const { state } = useNumberFieldRootContext();
  const { isScrubbing, isTouchInput, isPointerLockDenied, scrubAreaCursorRef } =
    useNumberFieldScrubAreaContext();

  const shouldRender = () =>
    isScrubbing() && !platform.engine.webkit && !isTouchInput() && !isPointerLockDenied();

  return (
    <Show when={shouldRender()}>
      <Portal mount={document.body}>
        {renderElement('span', componentProps, {
          defaultClass: 'wheel-NumberField-ScrubAreaCursor',
          slot: 'number-field-scrub-area-cursor',
          ref: (el: HTMLElement) => {
            scrubAreaCursorRef.current = el as HTMLSpanElement;
          },
          state,
          props: [
            {
              role: 'presentation',
              style: CURSOR_STYLE,
            },
            elementProps as Record<string, any>,
          ],
          stateAttributesMapping,
        })}
      </Portal>
    </Show>
  );
}

export interface NumberFieldScrubAreaCursorState extends NumberFieldRootState {}

export interface NumberFieldScrubAreaCursorProps
  extends BaseUIComponentProps<'span', NumberFieldScrubAreaCursorState> {}

export namespace NumberFieldScrubAreaCursor {
  export type State = NumberFieldScrubAreaCursorState;
  export type Props = NumberFieldScrubAreaCursorProps;
}
