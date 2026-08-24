/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';
import type { FloatingRootContext } from '../../floating-ui-solid';
import type { TransitionStatus } from '../../internals/createTransitionStatus';
import type { NavigationMenuRoot } from './NavigationMenuRoot';

export type NavigationMenuPopupAutoSizeResetState = {
  abortController: AbortController | null;
  owner: any;
};

export interface NavigationMenuRootContext<Value = any> {
  open: Accessor<boolean>;
  value: Accessor<NavigationMenuRoot.Value<Value>>;
  setValue: (
    value: NavigationMenuRoot.Value<Value>,
    eventDetails: NavigationMenuRoot.ChangeEventDetails,
  ) => void;
  transitionStatus: Accessor<TransitionStatus>;
  mounted: Accessor<boolean>;
  popupElement: Accessor<HTMLElement | null>;
  setPopupElement: (element: HTMLElement | null) => void;
  positionerElement: Accessor<HTMLElement | null>;
  setPositionerElement: (element: HTMLElement | null) => void;
  viewportElement: Accessor<HTMLElement | null>;
  setViewportElement: (element: HTMLElement | null) => void;
  viewportTargetElement: Accessor<HTMLElement | null>;
  setViewportTargetElement: (element: HTMLElement | null) => void;
  activationDirection: Accessor<'left' | 'right' | 'up' | 'down' | null>;
  setActivationDirection: (value: 'left' | 'right' | 'up' | 'down' | null) => void;
  floatingRootContext: Accessor<FloatingRootContext | undefined>;
  setFloatingRootContext: (value: FloatingRootContext | undefined) => void;
  currentContentRef: { current: HTMLElement | null };
  nested: boolean;
  rootRef: { current: HTMLElement | null };
  beforeInsideRef: { current: HTMLSpanElement | null };
  afterInsideRef: { current: HTMLSpanElement | null };
  beforeOutsideRef: { current: HTMLSpanElement | null };
  afterOutsideRef: { current: HTMLSpanElement | null };
  prevTriggerElementRef: { current: Element | null | undefined };
  popupAutoSizeResetRef: { current: NavigationMenuPopupAutoSizeResetState };
  delay: Accessor<number>;
  closeDelay: Accessor<number>;
  orientation: Accessor<'horizontal' | 'vertical'>;
  viewportInert: Accessor<boolean>;
  setViewportInert: (value: boolean) => void;
}

export const NavigationMenuRootContext = createContext<
  NavigationMenuRootContext<any> | undefined
>(undefined);

export function useNavigationMenuRootContext<Value = any>(
  optional?: false,
): NavigationMenuRootContext<Value>;
export function useNavigationMenuRootContext<Value = any>(
  optional: true,
): NavigationMenuRootContext<Value> | undefined;
export function useNavigationMenuRootContext<Value = any>(optional?: boolean) {
  const context = useContext(NavigationMenuRootContext) as
    | NavigationMenuRootContext<Value>
    | undefined;
  if (context === undefined && !optional) {
    throw new Error(
      'Base UI: NavigationMenuRootContext is missing. Navigation Menu parts must be placed within <NavigationMenu.Root>.',
    );
  }
  return context;
}

export const NavigationMenuTreeContext = createContext<string | undefined>(undefined);

export function useNavigationMenuTreeContext() {
  return useContext(NavigationMenuTreeContext);
}
