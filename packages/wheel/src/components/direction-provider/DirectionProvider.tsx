/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { JSX } from 'solid-js';
import {
  DirectionContext,
  type TextDirection,
} from '../internals/direction-context/DirectionContext';

/**
 * Enables RTL behavior for Base UI components.
 *
 * Documentation: [Base UI Direction Provider](https://base-ui.com/react/utils/direction-provider)
 */
export function DirectionProvider(props: DirectionProvider.Props): JSX.Element {
  const direction = () => props.direction ?? 'ltr';

  return (
    <DirectionContext.Provider value={{ direction }}>{props.children}</DirectionContext.Provider>
  );
}

export interface DirectionProviderState {}

export interface DirectionProviderProps {
  children?: JSX.Element;
  /**
   * The reading direction of the text
   * @default 'ltr'
   */
  direction?: TextDirection | undefined;
}

export namespace DirectionProvider {
  export type State = DirectionProviderState;
  export type Props = DirectionProviderProps;
}
