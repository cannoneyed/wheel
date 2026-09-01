/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import {
  createMemo,
  untrack,
  Show,
  type Accessor,
  type JSX,
  type ValidComponent,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { EMPTY_OBJECT } from '../base-utils/empty';
import type { AsChildRenderFn, HTMLProps, MaybeAccessor } from './types';
import { access } from './types';
import { getStateAttributesProps, type StateAttributesMapping } from './getStateAttributesProps';
import { mergeProps, mergePropsN, mergeClassNames, mergeStyles } from '../merge-props/mergeProps';
import { roleOfProps, viewRoot } from '../../core/connect';

type IntrinsicTagName = keyof JSX.IntrinsicElements;

/**
 * `radio-root` → `RadioRoot`: the name this part answers to in the component
 * tree, in `__wheel.component()`, and on a note's anchor.
 *
 * Derived from the `slot` every part already declares rather than added to 188
 * call sites, because the slot IS the part's stable identity — it is the same
 * string app CSS targets with `[data-slot]`.
 */
function partName(slot: string): string {
  return slot
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * The subset of a component's own props that `renderElement` consumes.
 * Pass the component's whole props object — never destructure it.
 */
export interface RenderElementComponentProps<State> {
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
}

export interface RenderElementParams<State> {
  /** Stable recipe class merged before the consumer's `class` prop. */
  defaultClass?: MaybeAccessor<string | undefined> | undefined;
  /** Stable part name exposed for app CSS and inspection tools. */
  slot?: MaybeAccessor<string | undefined> | undefined;
  /**
   * If `false`, nothing is rendered. Reactive when passed as an accessor.
   * @default true
   */
  enabled?: MaybeAccessor<boolean> | undefined;
  /**
   * Refs to attach to the rendered element, composed with the component
   * consumer's own `ref`.
   */
  ref?: ((el: any) => void) | Array<((el: any) => void) | undefined> | undefined;
  /**
   * The component's reactive state object (properties should be getters).
   */
  state?: State | undefined;
  /**
   * Intrinsic props to spread on the rendered element. Each entry can be:
   * - a plain object (static props and event handlers),
   * - a zero-argument thunk returning props (for reactive values) — thunks
   *   are re-evaluated reactively,
   * - the component's `elementProps` rest from `splitProps`.
   * Entries are merged left to right with Base UI semantics (handlers chain,
   * `class`/`style` merge). `children` and `ref` keys are excluded.
   * One-parameter functions are props getters receiving the merged props
   * (see CONVENTIONS.md on arity).
   */
  props?:
    | HTMLProps
    | Array<HTMLProps | (() => HTMLProps) | ((props: HTMLProps) => HTMLProps) | undefined>
    | undefined;
  /**
   * A mapping of state keys to custom `data-*` attribute producers.
   */
  stateAttributesMapping?: StateAttributesMapping<State> | undefined;
  /**
   * Overrides the rendered children (e.g. to inject extra elements alongside
   * the consumer's children).
   */
  children?: Accessor<JSX.Element> | undefined;
}

/**
 * Renders a Base UI element. Solid port of upstream's `useRenderElement`.
 *
 * The default tag can be overridden by the consumer via `as` (tag name or
 * component) or `asChild` (children-as-function receiving resolved props and
 * state). All prop computation runs inside a memo, so state changes update
 * `class`, `style` and `data-*` attributes without re-creating the element.
 */
export function renderElement<State extends Record<string, any>>(
  element: IntrinsicTagName | Accessor<IntrinsicTagName>,
  componentProps: RenderElementComponentProps<State>,
  params: RenderElementParams<State> = {},
): JSX.Element {
  const state = (params.state ?? EMPTY_OBJECT) as State;

  const resolveTag = () => {
    if (componentProps.asChild) {
      return undefined;
    }
    const as = componentProps.as;
    if (as !== undefined) {
      return typeof as === 'string' ? as : undefined;
    }
    return typeof element === 'function' ? element() : element;
  };

  // All merged props except `ref` and `children`, recomputed reactively.
  // Keys that disappear between runs are re-emitted as `undefined` so
  // Solid's spread removes the corresponding attribute.
  const seenKeys = new Set<string>();
  const finalProps = createMemo<Record<string, any>>(() => {
    const stateProps = getStateAttributesProps(state, params.stateAttributesMapping);
    const identityProps: HTMLProps = {
      class: params.defaultClass === undefined ? undefined : access(params.defaultClass),
      'data-slot': params.slot === undefined ? undefined : access(params.slot),
    };

    const propsParam = params.props;
    const resolved = Array.isArray(propsParam)
      ? mergePropsN(propsParam.map(resolveThunk))
      : mergeProps(identityProps, stateProps, resolveThunk(propsParam));

    const out: Record<string, any> = Array.isArray(propsParam)
      ? mergeProps(identityProps, stateProps, resolved)
      : resolved;

    const className = resolveClassName(componentProps.class, state);
    if (className !== undefined) {
      out.class = mergeClassNames(out.class, className);
    }

    const style = resolveStyle(componentProps.style, state);
    if (style !== undefined) {
      out.style = mergeStyles(out.style, style);
    }

    delete out.children;
    delete out.ref;
    delete out.as;
    delete out.asChild;

    // Upstream defaults: `<button>` is always type="button", `<img>` gets alt="".
    const tag = resolveTag();
    if (tag === 'button' && out.type === undefined) {
      out.type = 'button';
    }
    if (tag === 'img' && out.alt === undefined) {
      out.alt = '';
    }

    for (const key of seenKeys) {
      if (!(key in out)) {
        out[key] = undefined;
      }
    }
    for (const key in out) {
      seenKeys.add(key);
    }

    return out;
  });

  // Stable identity so the ref effect never re-fires on prop updates.
  // External refs land on `componentProps.ref`; internal ones via params.
  const composedRef = (el: any) => {
    untrack(() => {
      // Every library part registers in the component tree, from the one place
      // they all render through. `viewRoot` is dev-only and inert outside a
      // provider, so a part used in a plain Solid page costs nothing — but
      // inside a wheel app the tree finally contains the library itself, which
      // is what makes a Radio selectable by the inspector and the annotator.
      const slot = params.slot === undefined ? undefined : access(params.slot);
      // `data-wheel-role` comes from the merged props, not from the element: a
      // spread attribute lands after this ref runs, so reading the DOM here
      // would miss every `<Button data-wheel-role="add">`.
      if (slot) viewRoot(el, () => ({ name: partName(slot), role: roleOfProps(finalProps()) }));
      componentProps.ref?.(el);
      const paramRef = params.ref;
      if (Array.isArray(paramRef)) {
        for (const r of paramRef) {
          r?.(el);
        }
      } else {
        paramRef?.(el);
      }
    });
  };

  const renderChildren = (): JSX.Element => {
    if (params.children) {
      return params.children();
    }
    return componentProps.children as JSX.Element;
  };

  const renderNode = (): JSX.Element => {
    if (componentProps.asChild) {
      const renderFn = componentProps.children;
      if (typeof renderFn !== 'function') {
        throw new Error(
          'Base UI Solid: `asChild` requires `children` to be a function that receives ' +
            'the resolved props and state and returns an element: ' +
            '`<Component asChild>{(props, state) => <div {...props} />}</Component>`.',
        );
      }
      const childProps = solidMergeSpread(finalProps, composedRef, params.children);
      return untrack(() => (renderFn as AsChildRenderFn<State>)(childProps, state));
    }

    const component = () => {
      if (componentProps.as !== undefined && typeof componentProps.as !== 'string') {
        return componentProps.as;
      }
      return resolveTag() as ValidComponent;
    };

    return (
      <Dynamic component={component()} {...solidMergeSpread(finalProps)} ref={composedRef}>
        {renderChildren()}
      </Dynamic>
    );
  };

  const enabledParam = params.enabled;
  if (enabledParam === undefined) {
    return renderNode();
  }

  return <Show when={access(enabledParam) !== false || undefined}>{renderNode()}</Show>;
}

/**
 * Wraps the final-props memo in a proxy whose property reads stay live, so
 * spreading it in JSX (or in an `asChild` consumer) remains reactive.
 * When the component injects its own children (`params.children`), they are
 * exposed through the proxy so `asChild` consumers spreading the props still
 * render them (matching upstream, where injected children ride along in the
 * props given to the `render` function).
 */
function solidMergeSpread(
  finalProps: Accessor<Record<string, any>>,
  ref?: (el: any) => void,
  children?: Accessor<JSX.Element>,
): HTMLProps {
  return new Proxy(
    {},
    {
      get(_, property: string) {
        if (ref && property === 'ref') {
          return ref;
        }
        if (children && property === 'children') {
          return children();
        }
        return finalProps()[property];
      },
      has(_, property: string) {
        if (ref && property === 'ref') {
          return true;
        }
        if (children && property === 'children') {
          return true;
        }
        return property in finalProps();
      },
      ownKeys() {
        const keys = Reflect.ownKeys(finalProps());
        if (ref && !keys.includes('ref')) {
          keys.push('ref');
        }
        if (children && !keys.includes('children')) {
          keys.push('children');
        }
        return keys;
      },
      getOwnPropertyDescriptor(_, property: string) {
        // The descriptor must carry a live `get`: Solid's `splitProps`/
        // `mergeProps` clone properties via their descriptors rather than
        // indexing through the proxy, so a data-less descriptor would make
        // every prop forwarded into a second Base UI component (asChild
        // nesting) silently resolve to `undefined`.
        return {
          enumerable: true,
          configurable: true,
          get: () => {
            if (ref && property === 'ref') {
              return ref;
            }
            if (children && property === 'children') {
              return children();
            }
            return finalProps()[property];
          },
        };
      },
    },
  ) as HTMLProps;
}

function resolveThunk(input: HTMLProps | (() => HTMLProps) | undefined) {
  // Zero-arg thunks are evaluated here (reactively, since we're inside the
  // memo); single-arg functions keep upstream's props-getter semantics and
  // are resolved by mergeProps itself.
  if (typeof input === 'function' && input.length === 0) {
    return (input as () => HTMLProps)();
  }
  return input;
}

function resolveClassName<State>(
  className: string | ((state: State) => string | undefined) | undefined,
  state: State,
): string | undefined {
  return typeof className === 'function' ? className(state) : className;
}

function resolveStyle<State>(
  style:
    | JSX.CSSProperties
    | string
    | ((state: State) => JSX.CSSProperties | string | undefined)
    | undefined,
  state: State,
): JSX.CSSProperties | string | undefined {
  return typeof style === 'function' ? style(state) : style;
}
