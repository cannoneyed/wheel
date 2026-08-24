/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-tracked-show -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { Show, splitProps, type JSX } from 'solid-js';
import { useSelectRootContext } from '../root/SelectRootContext';
import { SelectPortalContext } from './SelectPortalContext';
import { FloatingPortal } from '../../floating-ui-solid';
import type { BaseUIComponentProps } from '../../internals/types';

/**
 * A portal element that moves the popup to a different part of the DOM.
 * By default, the portal element is appended to `<body>`.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Select](https://base-ui.com/react/components/select)
 */
export function SelectPortal(componentProps: SelectPortal.Props): JSX.Element {
  // Not destructuring `children` out: it must flow into `<FloatingPortal>` untouched (read
  // exactly once, by `FloatingPortal` itself) rather than being read here and re-passed, per the
  // props-forwarding convention for JSX children.
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'container']);

  const { store } = useSelectRootContext();
  const mounted = store.useState('mounted');
  const forceMount = store.useState('forceMount');

  const shouldRender = () => mounted() || forceMount();

  return (
    <Show when={shouldRender()}>
      <SelectPortalContext.Provider value={true}>
        <FloatingPortal {...(elementProps as FloatingPortal.Props)} />
      </SelectPortalContext.Provider>
    </Show>
  );
}

export interface SelectPortalState {}

export interface SelectPortalProps extends BaseUIComponentProps<'div', SelectPortalState> {
  container?: HTMLElement | ShadowRoot | null | undefined;
}

export namespace SelectPortal {
  export type State = SelectPortalState;
  export type Props = SelectPortalProps;
}
