/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';
import { NOOP } from '../../base-utils/empty';
import type { HTMLProps } from '../types';

/**
 * A context for providing labelable elements (https://html.spec.whatwg.org/multipage/forms.html#category-label)
 * with an accessible name (label) and description.
 * Solid port of upstream's `LabelableContext`.
 */
export interface LabelableContext {
  /**
   * The `id` of the labelable element.
   * When `null` the association is implicit.
   */
  controlId: Accessor<string | null | undefined>;
  registerControlId: (source: symbol, id: string | null | undefined) => void;
  /**
   * The `id` of the label.
   */
  labelId: Accessor<string | undefined>;
  setLabelId: (id: string | undefined) => void;
  /**
   * An array of `id`s of elements that provide an accessible description.
   */
  messageIds: Accessor<string[]>;
  setMessageIds: (updater: (prev: string[]) => string[]) => void;
  getDescriptionProps: (externalProps: HTMLProps) => HTMLProps;
}

const DEFAULT_LABELABLE_CONTEXT: LabelableContext = {
  controlId: () => undefined,
  registerControlId: NOOP,
  labelId: () => undefined,
  setLabelId: NOOP,
  messageIds: () => [],
  setMessageIds: NOOP,
  getDescriptionProps: (externalProps: HTMLProps) => externalProps,
};

export const LabelableContext = createContext<LabelableContext>(DEFAULT_LABELABLE_CONTEXT);

export function useLabelableContext() {
  return useContext(LabelableContext);
}
