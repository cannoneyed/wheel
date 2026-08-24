/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { Accessor } from 'solid-js';
import type { VirtualElement } from '@floating-ui/dom';
import type { BaseUIChangeEventDetails } from '../internals/createBaseUIEventDetails';
import type { HTMLProps, MaybeAccessor } from '../internals/types';
import type { UsePositionOptions, UsePositionReturn } from './hooks/usePosition';
import type { FloatingTreeStore } from './components/FloatingTreeStore';
import type { FloatingRootStore } from './components/FloatingRootStore';

export type Delay = number | Partial<{ open: number; close: number }>;

export type NarrowedElement<T> = T extends Element ? T : Element;

/**
 * Any DOM element or virtual element usable as a floating-ui reference.
 */
export type ReferenceType = Element | VirtualElement;

/**
 * Plain mutable refs + reactive setters, mirroring upstream's `ExtendedRefs`.
 * The setters also write the accessor-backed `elements` signals so reads
 * through `context.elements` stay reactive.
 */
export interface ExtendedRefs {
  reference: { current: ReferenceType | null };
  floating: { current: HTMLElement | null };
  domReference: { current: NarrowedElement<ReferenceType> | null };
  setReference(node: ReferenceType | null): void;
  setFloating(node: HTMLElement | null): void;
  setPositionReference(node: ReferenceType | null): void;
}

/**
 * Accessor-backed counterpart of upstream's `ExtendedElements` (locked design
 * decision: reactive values in contexts/returns are `Accessor`s).
 */
export interface ExtendedElements {
  reference: Accessor<ReferenceType | null>;
  floating: Accessor<HTMLElement | null>;
  domReference: Accessor<NarrowedElement<ReferenceType> | null>;
}

export interface FloatingEvents {
  emit<T extends string>(event: T, data?: any): void;
  on(event: string, handler: (data: any) => void): void;
  off(event: string, handler: (data: any) => void): void;
}

export interface ContextData {
  openEvent?: Event | undefined;
  floatingContext?: FloatingContext | undefined;
  [key: string]: any;
}

export type FloatingRootContext = FloatingRootStore;

export type FloatingContext = Omit<UsePositionReturn, 'update'> & {
  update(): void;
  open: Accessor<boolean>;
  onOpenChange(open: boolean, eventDetails: BaseUIChangeEventDetails<string>): void;
  events: FloatingEvents;
  dataRef: { current: ContextData };
  nodeId: string | undefined;
  floatingId: Accessor<string | undefined>;
  refs: ExtendedRefs;
  elements: ExtendedElements;
  rootStore: FloatingRootContext;
};

export interface FloatingNodeType {
  id: string | undefined;
  parentId: string | null;
  context?: FloatingContext | undefined;
}

export type FloatingTreeType = FloatingTreeStore;

export interface ElementProps {
  reference?: HTMLProps<Element> | undefined;
  floating?: HTMLProps<HTMLElement> | undefined;
  item?: HTMLProps<HTMLElement> | undefined;
  trigger?: HTMLProps<Element> | undefined;
}

export type UseFloatingData = UseFloatingReturn;

export type UseFloatingReturn = Omit<UsePositionReturn, 'update'> & {
  update(): void;
  /**
   * `FloatingContext`
   */
  context: FloatingContext;
  /**
   * Object containing the reference and floating refs and reactive setters.
   */
  refs: ExtendedRefs;
  elements: ExtendedElements;
  rootStore: FloatingRootContext;
};

export interface UseFloatingOptions extends Omit<UsePositionOptions, 'elements' | 'open'> {
  rootContext?: FloatingRootContext | undefined;
  /**
   * Whether the floating element is open. Ignored when `rootContext` is
   * provided (the root context owns `open` in that case).
   */
  open?: MaybeAccessor<boolean | undefined>;
  /**
   * Object of external elements as an alternative to the `refs` object setters.
   */
  elements?:
    | {
        /**
         * Externally passed reference element. Store in state.
         */
        reference?: MaybeAccessor<ReferenceType | null | undefined>;
        /**
         * Externally passed floating element. Store in state.
         */
        floating?: MaybeAccessor<HTMLElement | null | undefined>;
      }
    | undefined;
  /**
   * An event callback that is invoked when the floating element is opened or
   * closed.
   */
  onOpenChange?(open: boolean, eventDetails: BaseUIChangeEventDetails<string>): void;
  /**
   * Unique node id when using `FloatingTree`.
   */
  nodeId?: string | undefined;
  /**
   * External FloatingTree to use when the one provided by context can't be used.
   */
  externalTree?: FloatingTreeStore | undefined;
}
