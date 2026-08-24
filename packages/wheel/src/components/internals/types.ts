/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { JSX, ValidComponent } from 'solid-js';

/**
 * Any DOM event handled by Base UI Solid. Handlers merged by `mergeProps` can
 * call `event.preventBaseUIHandler()` to stop Base UI's own handler for the
 * same event from running.
 */
export type BaseUIEvent<E extends Event = Event> = E & {
  preventBaseUIHandler: () => void;
  readonly baseUIHandlerPrevented?: boolean;
};

/**
 * A generic props bag for a rendered element. Deliberately loose: this is the
 * internal merge-layer type (upstream's `HTMLProps`); the public component
 * API surface stays strongly typed via {@link BaseUIComponentProps}.
 */
export type HTMLProps<T = any> = Record<string, any> & {
  ref?: ((el: T) => void) | undefined;
  class?: string | undefined;
  style?: JSX.CSSProperties | string | undefined;
};

/**
 * The children function used with `asChild`: receives the component's
 * resolved props (spread them onto your element) and its reactive state.
 */
export type AsChildRenderFn<State = {}> = (props: HTMLProps, state: State) => JSX.Element;

/**
 * Props shared by all Base UI Solid components.
 *
 * - `class` — string, or a function of the component's state.
 * - `style` — style object/string, or a function of the component's state.
 * - `as` — replace the default rendered element with a tag name or component.
 * - `asChild` — take full control: `children` becomes a function receiving
 *   the resolved props and state.
 */
export type BaseUIComponentProps<
  TagName extends keyof JSX.IntrinsicElements,
  State,
> = Omit<JSX.IntrinsicElements[TagName], 'class' | 'style' | 'children' | 'ref'> & {
  class?: string | ((state: State) => string | undefined) | undefined;
  style?:
    | JSX.CSSProperties
    | string
    | ((state: State) => JSX.CSSProperties | string | undefined)
    | undefined;
  as?: ValidComponent | undefined;
  asChild?: boolean | undefined;
  ref?: ((el: any) => void) | undefined;
  children?: JSX.Element | AsChildRenderFn<State>;
};

export interface NativeButtonProps {
  /**
   * Whether the component renders a native `<button>` element.
   * Set to `false` if the rendered element (via `as`/`asChild`) is not a button.
   * @default true
   */
  nativeButton?: boolean | undefined;
}

export interface NonNativeButtonProps {
  /**
   * Whether the component renders a native `<button>` element.
   * Set to `true` if the rendered element (via `as`/`asChild`) is a native button.
   * @default false
   */
  nativeButton?: boolean | undefined;
}

export type Orientation = 'horizontal' | 'vertical';

/**
 * Details describing an open-state change dispatched through the floating-ui
 * root store (`FloatingRootStore.dispatchOpenChange`).
 */
export interface FloatingUIOpenChangeDetails {
  open: boolean;
  reason: string;
  nativeEvent: Event;
  nested: boolean;
  triggerElement?: Element | undefined;
}

/**
 * A value that may be wrapped in an accessor.
 */
export type MaybeAccessor<T> = T | (() => T);

export function access<T>(value: MaybeAccessor<T>): T {
  return typeof value === 'function' ? (value as () => T)() : value;
}
