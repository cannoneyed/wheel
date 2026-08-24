/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal, wheel/require-view-root -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import {
  createComputed,
  createEffect,
  createSignal,
  For,
  onCleanup,
  splitProps,
  type JSX,
} from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import {
  useFieldRootContext,
  type FieldRootState,
} from '../../internals/field-root-context/FieldRootContext';
import { useLabelableContext } from '../../internals/labelable-provider/LabelableContext';
import { fieldValidityMapping } from '../../internals/field-constants/constants';
import { useFormContext } from '../../internals/form-context/FormContext';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import { createTransitionStatus, type TransitionStatus } from '../../internals/createTransitionStatus';

const stateAttributesMapping: StateAttributesMapping<FieldErrorState> = {
  ...fieldValidityMapping,
  ...transitionStatusMapping,
};

/**
 * An error message displayed if the field control fails validation.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Field](https://base-ui.com/react/components/field)
 */
export function FieldError(componentProps: FieldError.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'id',
    'match',
  ]);

  const id = createBaseUiId(() => componentProps.id);

  const { validityData, state: fieldState, name } = useFieldRootContext(false);
  const { setMessageIds } = useLabelableContext();

  const { errors } = useFormContext();

  const formError = () => {
    const n = name();
    return n && Object.hasOwn(errors(), n) ? errors()[n] : null;
  };
  const hasFormError = () => {
    const error = formError();
    return !!(Array.isArray(error) ? error.length : error);
  };
  const hasSpecificMatch = () => typeof componentProps.match === 'string';

  const rendered = () => {
    if (componentProps.match === true) {
      return true;
    }
    if (fieldState.disabled) {
      return false;
    }
    if (hasSpecificMatch()) {
      return Boolean(validityData().state[componentProps.match as keyof ValidityState]);
    }
    return hasFormError() || validityData().state.valid === false;
  };

  const { mounted, transitionStatus, setMounted } = createTransitionStatus(rendered);

  createEffect(() => {
    const currentId = id();
    if (!rendered() || !currentId) {
      return;
    }

    setMessageIds((v) => v.concat(currentId));

    onCleanup(() => {
      setMessageIds((v) => v.filter((item) => item !== currentId));
    });
  });

  let errorRef: HTMLDivElement | undefined;

  const errorValue = (): string | string[] | null | undefined => {
    if (!hasSpecificMatch() && hasFormError()) {
      return formError();
    }
    if (validityData().errors.length > 1) {
      return validityData().errors;
    }
    return validityData().error;
  };

  const errorMessage = (): JSX.Element => {
    const error = errorValue();
    if (Array.isArray(error)) {
      if (error.length > 1) {
        return (
          <ul>
            <For each={error}>{(message) => <li>{message}</li>}</For>
          </ul>
        );
      }
      return error[0] ?? '';
    }
    return error ?? '';
  };

  const errorKey = (): string | null => {
    const error = errorValue();
    return Array.isArray(error) ? JSON.stringify(error) : (error ?? '');
  };

  const [lastRenderedMessage, setLastRenderedMessage] = createSignal<JSX.Element>(null);
  const [lastRenderedMessageKey, setLastRenderedMessageKey] = createSignal<string | null>(null);

  // Mirrors upstream's render-phase "hold the last message while exiting" cascade (see
  // `createTransitionStatus`'s doc comment for why `createComputed` reproduces React's
  // set-state-during-render semantics here).
  createComputed(() => {
    if (rendered() && errorKey() !== lastRenderedMessageKey()) {
      setLastRenderedMessageKey(errorKey());
      setLastRenderedMessage(errorMessage());
    }
  });

  createOpenChangeComplete({
    open: rendered,
    getElement: () => errorRef,
    onComplete() {
      if (!rendered()) {
        setMounted(false);
      }
    },
  });

  const state: FieldError.State = {
    get disabled() {
      return fieldState.disabled;
    },
    get touched() {
      return fieldState.touched;
    },
    get dirty() {
      return fieldState.dirty;
    },
    get valid() {
      return fieldState.valid;
    },
    get filled() {
      return fieldState.filled;
    },
    get focused() {
      return fieldState.focused;
    },
    get transitionStatus() {
      return transitionStatus();
    },
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Field-Error',
    slot: 'field-error',
    state,
    ref: (el: HTMLDivElement) => {
      errorRef = el;
    },
    props: [() => ({ id: id() }), elementProps as Record<string, any>],
    stateAttributesMapping,
    enabled: mounted,
    // Consumer-provided children win over the computed message, matching
    // upstream (where the internal `children` sits before `elementProps` in
    // the merge order). Read `componentProps.children` exactly once per
    // evaluation — the read itself creates the child elements.
    children: () => {
      // With `asChild`, `children` is the render function, not content.
      if (!componentProps.asChild) {
        const consumerChildren = componentProps.children as JSX.Element;
        if (consumerChildren !== undefined) {
          return consumerChildren;
        }
      }
      return rendered() ? errorMessage() : lastRenderedMessage();
    },
  });
}

export interface FieldErrorState extends FieldRootState {
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
}

export interface FieldErrorProps extends BaseUIComponentProps<'div', FieldErrorState> {
  /**
   * Determines whether to show the error message according to the field's
   * [ValidityState](https://developer.mozilla.org/en-US/docs/Web/API/ValidityState).
   * Specifying `true` will always show the error message, and lets external libraries
   * control the visibility.
   */
  match?: boolean | keyof ValidityState | undefined;
}

export namespace FieldError {
  export type State = FieldErrorState;
  export type Props = FieldErrorProps;
}
