/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createSignal, untrack, type Accessor } from 'solid-js';
import { EMPTY_ARRAY } from '../base-utils/empty';
import { createBaseUiId } from '../internals/createBaseUiId';
import type { BaseUIChangeEventDetails } from '../internals/createBaseUIEventDetails';
import type { BaseUIEventReasons } from '../internals/reasons';

const EMPTY = EMPTY_ARRAY as readonly string[];

/**
 * Solid port of upstream's `useCheckboxGroupParent`: derives a parent
 * checkbox's tri-state (`checked`/`indeterminate`) from the group's `value`
 * and `allValues`, and computes the next group value when the parent or a
 * child checkbox is toggled.
 */
export function useCheckboxGroupParent(
  params: UseCheckboxGroupParentParameters,
): UseCheckboxGroupParentReturnValue {
  const allValues = () => params.allValues?.() ?? EMPTY;
  const value = () => params.value?.() ?? EMPTY;

  // Snapshot of the last successfully-committed value. Mirrors upstream's
  // `uncontrolledStateRef`: only advanced when a change isn't canceled, used
  // to compute the "all"/"none" candidate arrays for the parent toggle.
  let uncontrolledState: readonly string[] = untrack(value);
  const disabledStatesRef = { current: new Map<string, boolean>() };

  const [status, setStatus] = createSignal<'on' | 'off' | 'mixed'>('mixed');

  const id = createBaseUiId();
  const checked = () => value().length === allValues().length;
  const indeterminate = () => value().length !== allValues().length && value().length > 0;

  const onValueChange = params.onValueChange;

  const getParentProps: UseCheckboxGroupParentReturnValue['getParentProps'] = () => ({
    id: id(),
    indeterminate: indeterminate(),
    checked: checked(),
    // TODO: custom `id` on child checkboxes breaks this
    // https://github.com/mui/base-ui/issues/2691
    'aria-controls': allValues()
      .map((v) => `${id()}-${v}`)
      .join(' '),
    onCheckedChange(
      _next: boolean,
      eventDetails: BaseUIChangeEventDetails<BaseUIEventReasons['none']>,
    ) {
      const currentValue = value();
      const currentAllValues = allValues();

      // None except the disabled ones that are checked, which can't be changed.
      const none = currentAllValues.filter(
        (v) => disabledStatesRef.current.get(v) && uncontrolledState.includes(v),
      );
      // "All" that are valid:
      // - any that aren't disabled
      // - disabled ones that are checked
      const all = currentAllValues.filter(
        (v) =>
          !disabledStatesRef.current.get(v) ||
          (disabledStatesRef.current.get(v) && uncontrolledState.includes(v)),
      );

      const allOnOrOff =
        uncontrolledState.length === all.length || uncontrolledState.length === 0;

      if (allOnOrOff) {
        if (currentValue.length === all.length) {
          onValueChange?.(none, eventDetails);
        } else {
          onValueChange?.(all, eventDetails);
        }
        return;
      }

      let nextStatus: 'on' | 'off' | 'mixed' = 'mixed';
      let nextValue: string[] = uncontrolledState as string[];

      if (status() === 'mixed') {
        nextStatus = 'on';
        nextValue = all;
      } else if (status() === 'on') {
        nextStatus = 'off';
        nextValue = none;
      }

      onValueChange?.(nextValue, eventDetails);

      if (!eventDetails.isCanceled) {
        setStatus(nextStatus);
      }
    },
  });

  const getChildProps: UseCheckboxGroupParentReturnValue['getChildProps'] = (
    childValue: string,
  ) => ({
    checked: value().includes(childValue),
    onCheckedChange(
      nextChecked: boolean,
      eventDetails: BaseUIChangeEventDetails<BaseUIEventReasons['none']>,
    ) {
      const newValue = value().slice() as string[];
      if (nextChecked) {
        newValue.push(childValue);
      } else {
        newValue.splice(newValue.indexOf(childValue), 1);
      }

      onValueChange?.(newValue, eventDetails);

      if (!eventDetails.isCanceled) {
        uncontrolledState = newValue;
        setStatus('mixed');
      }
    },
  });

  return {
    id,
    indeterminate,
    getParentProps,
    getChildProps,
    disabledStatesRef,
  };
}

export interface UseCheckboxGroupParentParameters {
  allValues?: Accessor<readonly string[] | undefined> | undefined;
  value?: Accessor<readonly string[] | undefined> | undefined;
  onValueChange?:
    | ((
        value: string[],
        eventDetails: BaseUIChangeEventDetails<BaseUIEventReasons['none']>,
      ) => void)
    | undefined;
}

export interface UseCheckboxGroupParentReturnValue {
  id: Accessor<string | undefined>;
  indeterminate: Accessor<boolean>;
  disabledStatesRef: { current: Map<string, boolean> };
  getParentProps: () => {
    id: string | undefined;
    indeterminate: boolean;
    checked: boolean;
    'aria-controls': string;
    onCheckedChange: (
      checked: boolean,
      eventDetails: BaseUIChangeEventDetails<BaseUIEventReasons['none']>,
    ) => void;
  };
  getChildProps: (value: string) => {
    checked: boolean;
    onCheckedChange: (
      checked: boolean,
      eventDetails: BaseUIChangeEventDetails<BaseUIEventReasons['none']>,
    ) => void;
  };
}
