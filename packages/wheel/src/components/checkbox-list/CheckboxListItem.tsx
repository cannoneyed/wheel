/* eslint-disable wheel/require-export-jsdoc -- Public guidance lives on the component and its stateful props; namespace aliases repeat that contract. */
/* eslint-disable wheel/require-view-root -- This presentational composition cannot import application inspection helpers without a layer cycle. */
import { createUniqueId, Show, splitProps, type JSX } from 'solid-js';
import { Checkbox } from '../checkbox';
import type { CheckboxRootChangeEventDetails } from '../checkbox/root/CheckboxRoot';
import type { CheckboxSize, CheckboxStatus } from '../checkbox/types';
import { useCheckboxGroupContext } from '../checkbox-group/CheckboxGroupContext';
import { renderElement } from '../internals/renderElement';
import type { BaseUIComponentProps } from '../internals/types';

/**
 * Renders one labeled Checkbox row with optional description and end content.
 *
 * Behavior contract: `packages/wheel/src/components/checkbox-list/checkbox-list-item.spec.md`.
 */
export function CheckboxListItem(componentProps: CheckboxListItem.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'as',
    'checked',
    'class',
    'defaultChecked',
    'description',
    'disabled',
    'endContent',
    'indeterminate',
    'label',
    'name',
    'onCheckedChange',
    'readOnly',
    'ref',
    'required',
    'size',
    'status',
    'style',
    'value',
  ]);
  const group = useCheckboxGroupContext();
  if (group && !local.value) {
    throw new Error('CheckboxListItem requires value inside CheckboxList or CheckboxGroup.');
  }

  const disabled = () => local.disabled ?? group?.disabled() ?? false;
  const readOnly = () => local.readOnly ?? group?.readOnly() ?? false;
  const size = (): CheckboxSize => local.size ?? group?.size() ?? 'md';
  const status = (): CheckboxStatus => local.status ?? group?.status() ?? 'default';
  const labelId = createUniqueId();
  const descriptionId = createUniqueId();

  const state: CheckboxListItem.State = {
    get disabled() {
      return disabled();
    },
    get readOnly() {
      return readOnly();
    },
    get size() {
      return size();
    },
    get status() {
      return status();
    },
  };

  return renderElement('label', componentProps, {
    defaultClass: 'wheel-CheckboxListItem',
    slot: 'checkbox-list-item',
    state,
    ref: local.ref,
    props: [elementProps as Record<string, unknown>],
    children: () => (
      <>
        <Checkbox.Root
          aria-describedby={local.description === undefined ? undefined : descriptionId}
          aria-labelledby={labelId}
          checked={local.checked}
          defaultChecked={local.defaultChecked}
          disabled={local.disabled}
          indeterminate={local.indeterminate}
          name={local.name}
          onCheckedChange={local.onCheckedChange}
          readOnly={local.readOnly}
          required={local.required}
          size={local.size}
          status={local.status}
          value={local.value}
        >
          <Checkbox.Indicator>
            <svg
              class="wheel-CheckboxListItem-check"
              aria-hidden="true"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
            >
              <path d="m2.5 8.5 4 4 7-9" />
            </svg>
            <span class="wheel-CheckboxListItem-mixed" aria-hidden="true" />
          </Checkbox.Indicator>
        </Checkbox.Root>
        <span class="wheel-CheckboxListItem-content">
          <span id={labelId} class="wheel-CheckboxListItem-label">{local.label}</span>
          <Show when={local.description !== undefined}>
            <span id={descriptionId} class="wheel-CheckboxListItem-description">
              {local.description}
            </span>
          </Show>
        </span>
        <Show when={local.endContent !== undefined}>
          <span class="wheel-CheckboxListItem-endContent">{local.endContent}</span>
        </Show>
      </>
    ),
  });
}

export interface CheckboxListItemState {
  /** Whether the row ignores interaction. */
  disabled: boolean;
  /** Whether the row blocks changes without disabled styling. */
  readOnly: boolean;
  /** Resolved Checkbox size. */
  size: CheckboxSize;
  /** Resolved validation tone. */
  status: CheckboxStatus;
}

export interface CheckboxListItemProps
  extends Omit<BaseUIComponentProps<'label', CheckboxListItemState>, 'children' | 'asChild'> {
  /** Primary visible and accessible label. */
  label: JSX.Element;
  /** Supporting text linked to the Checkbox. */
  description?: JSX.Element;
  /** Passive content rendered at the row end. */
  endContent?: JSX.Element;
  /** Collection identity. Required inside Checkbox List or Checkbox Group. */
  value?: string | undefined;
  /** Native form field name. */
  name?: string | undefined;
  /** Controlled checked state for standalone use. */
  checked?: boolean | undefined;
  /** Initial unchecked state for standalone use. @default false */
  defaultChecked?: boolean | undefined;
  /** Runs before an uncontrolled checked-state change commits. */
  onCheckedChange?:
    | ((checked: boolean, eventDetails: CheckboxRootChangeEventDetails) => void)
    | undefined;
  /** Whether the control exposes a mixed state. @default false */
  indeterminate?: boolean | undefined;
  /** Whether the row ignores interaction. @default false */
  disabled?: boolean | undefined;
  /** Whether the row blocks changes without disabled styling. @default false */
  readOnly?: boolean | undefined;
  /** Whether form validation requires a checked value. @default false */
  required?: boolean | undefined;
  /** Dense Checkbox size. Inherits from the group. */
  size?: CheckboxSize | undefined;
  /** Validation tone. Inherits from the group. */
  status?: CheckboxStatus | undefined;
}

export namespace CheckboxListItem {
  export type State = CheckboxListItemState;
  export type Props = CheckboxListItemProps;
}
