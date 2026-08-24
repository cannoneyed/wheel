/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { JSX } from 'solid-js';
import { mergeObjects } from '../base-utils/mergeObjects';
import type { BaseUIEvent, HTMLProps } from '../internals/types';

type InputProps = HTMLProps | ((otherProps: HTMLProps) => HTMLProps) | undefined;

const EMPTY_PROPS = {};

/**
 * Merges multiple sets of element props following the `Object.assign` pattern:
 * the rightmost object's fields overwrite conflicting ones from others.
 * This doesn't apply to event handlers, `class` and `style` props.
 *
 * Event handlers are merged and called in right-to-left order (the rightmost
 * handler executes first). The rightmost handler can prevent prior handlers
 * from executing by calling `event.preventBaseUIHandler()`.
 *
 * The `class` prop is merged by concatenating classes in right-to-left order.
 * The `style` prop is merged with rightmost styles overwriting prior ones.
 *
 * Props can also be provided as functions that take the previous merged props
 * as an argument and return new props. The function is responsible for
 * chaining event handlers itself if needed.
 *
 * NOTE: unlike Solid's built-in `mergeProps`, this is a plain (non-reactive)
 * merge. Callers are expected to run it inside a reactive computation — this
 * is what `renderElement` does. `children` and `ref` are not merged and must
 * be handled by the caller.
 *
 * @public
 */
export function mergeProps(
  a: InputProps,
  b?: InputProps,
  c?: InputProps,
  d?: InputProps,
  e?: InputProps,
): HTMLProps {
  if (!c && !d && !e && !a) {
    return createInitialMergedProps(b);
  }

  // We need to mutably own `merged`.
  let merged = createInitialMergedProps(a);

  if (b) {
    merged = mergeInto(merged, b);
  }
  if (c) {
    merged = mergeInto(merged, c);
  }
  if (d) {
    merged = mergeInto(merged, d);
  }
  if (e) {
    merged = mergeInto(merged, e);
  }

  return merged;
}

/**
 * Merges an arbitrary number of props objects using the same logic as
 * {@link mergeProps}, accepting an array instead of individual arguments.
 *
 * @public
 */
export function mergePropsN(props: InputProps[]): HTMLProps {
  if (props.length === 0) {
    return EMPTY_PROPS as HTMLProps;
  }
  if (props.length === 1) {
    return createInitialMergedProps(props[0]);
  }

  let merged = createInitialMergedProps(props[0]);

  for (let i = 1; i < props.length; i += 1) {
    merged = mergeInto(merged, props[i]);
  }

  return merged;
}

function createInitialMergedProps(inputProps: InputProps) {
  if (isPropsGetter(inputProps)) {
    // Getter-returned handlers intentionally keep their existing semantics.
    return { ...resolvePropsGetter(inputProps, EMPTY_PROPS) };
  }

  return copyInitialProps(inputProps);
}

function mergeInto(merged: Record<string, any>, inputProps: InputProps) {
  if (isPropsGetter(inputProps)) {
    return resolvePropsGetter(inputProps, merged);
  }
  return mutablyMergeInto(merged, inputProps);
}

function copyInitialProps(inputProps: HTMLProps | undefined) {
  const copiedProps = { ...inputProps } as Record<string, any>;

  for (const propName in copiedProps) {
    const propValue = copiedProps[propName];
    if (isEventHandlerKey(propName, propValue)) {
      copiedProps[propName] = normalizeEventHandler(propValue);
    }
  }

  return copiedProps;
}

/**
 * Merges two sets of props. In case of conflicts, the external props take precedence.
 */
function mutablyMergeInto(mergedProps: Record<string, any>, externalProps: HTMLProps | undefined) {
  if (!externalProps) {
    return mergedProps;
  }

  for (const propName in externalProps) {
    const externalPropValue = (externalProps as Record<string, any>)[propName];

    switch (propName) {
      case 'style': {
        mergedProps[propName] = mergeStyles(mergedProps.style, externalPropValue);
        break;
      }
      case 'class': {
        mergedProps[propName] = mergeClassNames(mergedProps.class, externalPropValue as string);
        break;
      }
      default: {
        if (isEventHandlerKey(propName, externalPropValue)) {
          mergedProps[propName] = mergeEventHandlers(mergedProps[propName], externalPropValue);
        } else {
          mergedProps[propName] = externalPropValue;
        }
      }
    }
  }

  return mergedProps;
}

function isEventHandlerKey(key: string, value: unknown) {
  // This approach is more efficient than using a regex.
  const code0 = key.charCodeAt(0);
  const code1 = key.charCodeAt(1);
  const code2 = key.charCodeAt(2);
  return (
    code0 === 111 /* o */ &&
    code1 === 110 /* n */ &&
    // onClick-style camelCase, plus Solid's namespaced `on:x`/`oncapture:x`
    // forms (the only way to attach real capture-phase listeners in Solid).
    (code2 === 58 /* : */ || (code2 >= 65 /* A */ && code2 <= 90) /* Z */ || key.startsWith('oncapture:')) &&
    (typeof value === 'function' || Array.isArray(value) || typeof value === 'undefined')
  );
}

function isPropsGetter(inputProps: InputProps): inputProps is (props: HTMLProps) => HTMLProps {
  return typeof inputProps === 'function';
}

function resolvePropsGetter(inputProps: InputProps, previousProps: HTMLProps) {
  if (isPropsGetter(inputProps)) {
    return inputProps(previousProps);
  }

  return inputProps ?? (EMPTY_PROPS as HTMLProps);
}

/**
 * Normalizes Solid's bound event handler form (`onClick={[fn, data]}`) into a
 * plain function so handlers can be composed uniformly.
 */
function toHandlerFunction(handler: unknown): Function | undefined {
  if (typeof handler === 'function') {
    return handler;
  }
  if (Array.isArray(handler) && typeof handler[0] === 'function') {
    const [fn, data] = handler;
    return (event: Event) => fn(data, event);
  }
  return undefined;
}

function mergeEventHandlers(ourHandler: unknown, theirHandler: unknown) {
  const ours = toHandlerFunction(ourHandler);
  const theirs = toHandlerFunction(theirHandler);

  if (!theirs) {
    return ours;
  }
  if (!ours) {
    return normalizeEventHandler(theirs);
  }

  return (...args: unknown[]) => {
    const event = args[0];

    if (isDOMEvent(event)) {
      const baseUIEvent = event as BaseUIEvent;

      makeEventPreventable(baseUIEvent);

      const result = theirs(...args);

      if (!baseUIEvent.baseUIHandlerPrevented) {
        ours(...args);
      }

      return result;
    }

    const result = theirs(...args);
    ours(...args);
    return result;
  };
}

function normalizeEventHandler(handler: unknown) {
  const fn = toHandlerFunction(handler);
  if (!fn) {
    return undefined;
  }

  return (...args: unknown[]) => {
    const event = args[0];

    if (isDOMEvent(event)) {
      makeEventPreventable(event as BaseUIEvent);
    }

    return fn(...args);
  };
}

export function makeEventPreventable<T extends Event>(event: BaseUIEvent<T>) {
  if (!Object.prototype.hasOwnProperty.call(event, 'preventBaseUIHandler')) {
    let prevented = false;
    Object.defineProperties(event, {
      preventBaseUIHandler: {
        value: () => {
          prevented = true;
        },
        configurable: true,
      },
      baseUIHandlerPrevented: {
        get: () => prevented,
        configurable: true,
      },
    });
  }

  return event;
}

export function mergeClassNames(
  ourClassName: string | undefined,
  theirClassName: string | undefined,
) {
  if (theirClassName) {
    if (ourClassName) {
      return theirClassName + ' ' + ourClassName;
    }

    return theirClassName;
  }

  return ourClassName;
}

/**
 * Merges two Solid `style` values (objects or strings). When both are objects
 * they are shallow-merged (rightmost wins); otherwise both are converted to
 * strings and concatenated, with the rightmost declarations last so they win.
 */
export function mergeStyles(
  ourStyle: JSX.CSSProperties | string | undefined,
  theirStyle: JSX.CSSProperties | string | undefined,
): JSX.CSSProperties | string | undefined {
  if (ourStyle == null) {
    return theirStyle;
  }
  if (theirStyle == null) {
    return ourStyle;
  }
  if (typeof ourStyle === 'object' && typeof theirStyle === 'object') {
    return mergeObjects(ourStyle, theirStyle);
  }
  return `${styleToString(ourStyle)};${styleToString(theirStyle)}`;
}

function styleToString(style: JSX.CSSProperties | string): string {
  if (typeof style === 'string') {
    return style.replace(/;\s*$/, '');
  }
  return Object.entries(style)
    .filter(([, value]) => value != null)
    .map(([key, value]) => `${key}:${value}`)
    .join(';');
}

function isDOMEvent(event: unknown): event is Event {
  return typeof Event !== 'undefined' && event instanceof Event;
}
