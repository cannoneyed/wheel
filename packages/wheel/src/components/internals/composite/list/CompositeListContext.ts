/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';
import type { CompositeMetadata } from './CompositeList';

export interface CompositeListContextValue<Metadata> {
  register: (node: Element, metadata: Metadata | undefined) => void;
  unregister: (node: Element) => void;
  subscribeMapChange: (
    fn: (map: Map<Element, CompositeMetadata<Metadata> | null>) => void,
  ) => () => void;
  /** Mutable, index-ordered list of registered elements (like upstream's `elementsRef.current`). */
  elements: Array<HTMLElement | null>;
  /** Mutable, index-ordered list of item labels. */
  labels?: Array<string | null> | undefined;
  /** Mutable counter used by `IndexGuessBehavior.GuessFromOrder`. */
  nextIndex: { current: number };
}

export const CompositeListContext = createContext<CompositeListContextValue<any>>({
  register: () => {},
  unregister: () => {},
  subscribeMapChange: () => () => {},
  elements: [],
  nextIndex: { current: 0 },
});

export function useCompositeListContext<Metadata = any>(): CompositeListContextValue<Metadata> {
  return useContext(CompositeListContext);
}
