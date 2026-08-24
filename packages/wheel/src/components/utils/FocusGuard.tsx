/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal, wheel/require-view-root -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createSignal, onMount, splitProps, type JSX } from 'solid-js';
import { platform } from '../base-utils/platform/index';
import { visuallyHidden } from '../base-utils/visuallyHidden';

export interface FocusGuardProps {
  ref?: ((el: HTMLSpanElement) => void) | undefined;
  onFocus?: ((event: FocusEvent) => void) | undefined;
  'data-type'?: string | undefined;
}

/**
 * Solid port of upstream's `utils/FocusGuard.tsx`.
 * @internal
 */
export function FocusGuard(props: FocusGuardProps): JSX.Element {
  const [local, rest] = splitProps(props, ['ref', 'onFocus']);
  const [role, setRole] = createSignal<'button' | undefined>(undefined);

  onMount(() => {
    // Unlike NVDA and JAWS, VoiceOver's virtual cursor triggers `onFocus` as
    // it moves — but only on focusable/role-button elements through WebKit's
    // NSAccessibility path. Setting `role="button"` lets the focus trap catch
    // the cursor.
    if (platform.screenReader.voiceOver && platform.engine.webkit) {
      setRole('button');
    }
  });

  return (
    <span
      {...rest}
      ref={local.ref}
      onFocus={(event) => local.onFocus?.(event)}
      style={visuallyHidden}
      aria-hidden={role() ? undefined : true}
      tabIndex={0}
      role={role()}
      data-base-ui-focus-guard=""
    />
  );
}
