/* eslint-disable wheel/require-export-jsdoc -- Public guidance lives on the component and its stateful props; namespace aliases repeat that contract. */
/* eslint-disable wheel/require-view-root -- This presentational composition cannot import application inspection helpers without a layer cycle. */
import { createUniqueId, Show, splitProps, type JSX } from 'solid-js';
import { CheckboxGroup } from '../checkbox-group';
import type { CheckboxGroupDensity } from '../checkbox-group/types';
import type { CheckboxSize, CheckboxStatus } from '../checkbox/types';
import { renderElement } from '../internals/renderElement';
import type { StateAttributesMapping } from '../internals/getStateAttributesProps';
import type { BaseUIComponentProps, Orientation } from '../internals/types';

const stateAttributesMapping: StateAttributesMapping<CheckboxListState> = {
  hasDividers(value) {
    return value ? { 'data-has-dividers': '' } : null;
  },
};

/**
 * Presents a labeled multi-value field built from Checkbox Group and Checkbox List Item.
 *
 * Behavior contract: `packages/wheel/src/components/checkbox-list/checkbox-list.spec.md`.
 */
export function CheckboxList(componentProps: CheckboxList.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'allValues',
    'as',
    'children',
    'class',
    'defaultValue',
    'density',
    'description',
    'disabled',
    'hasDividers',
    'label',
    'onValueChange',
    'orientation',
    'readOnly',
    'ref',
    'size',
    'status',
    'statusMessage',
    'style',
    'value',
  ]);

  const density = (): CheckboxGroupDensity => local.density ?? 'compact';
  const orientation = (): Orientation => local.orientation ?? 'vertical';
  const size = (): CheckboxSize => local.size ?? 'md';
  const status = (): CheckboxStatus => local.status ?? 'default';
  const disabled = () => local.disabled ?? false;
  const readOnly = () => local.readOnly ?? false;
  const hasDividers = () => local.hasDividers ?? false;
  const labelId = createUniqueId();
  const descriptionId = createUniqueId();
  const statusId = createUniqueId();
  const describedBy = () =>
    [local.description === undefined ? undefined : descriptionId,
      local.statusMessage === undefined ? undefined : statusId]
      .filter(Boolean)
      .join(' ') || undefined;

  const state: CheckboxList.State = {
    get density() {
      return density();
    },
    get disabled() {
      return disabled();
    },
    get hasDividers() {
      return hasDividers();
    },
    get orientation() {
      return orientation();
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

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-CheckboxList',
    slot: 'checkbox-list',
    state,
    stateAttributesMapping,
    ref: local.ref,
    props: [elementProps as Record<string, unknown>],
    children: () => (
      <>
        <div class="wheel-CheckboxList-heading">
          <div id={labelId} class="wheel-CheckboxList-label">{local.label}</div>
          <Show when={local.description !== undefined}>
            <div id={descriptionId} class="wheel-CheckboxList-description">
              {local.description}
            </div>
          </Show>
        </div>
        <CheckboxGroup
          aria-describedby={describedBy()}
          aria-labelledby={labelId}
          allValues={local.allValues}
          class="wheel-CheckboxList-group"
          defaultValue={local.defaultValue}
          density={density()}
          disabled={disabled()}
          onValueChange={local.onValueChange}
          orientation={orientation()}
          readOnly={readOnly()}
          size={size()}
          status={status()}
          value={local.value}
        >
          {local.children}
        </CheckboxGroup>
        <Show when={local.statusMessage !== undefined}>
          <div id={statusId} class="wheel-CheckboxList-status" aria-live="polite">
            {local.statusMessage}
          </div>
        </Show>
      </>
    ),
  });
}

export interface CheckboxListState {
  /** Spacing between direct items. */
  density: CheckboxGroupDensity;
  /** Whether every item ignores interaction. */
  disabled: boolean;
  /** Whether adjacent items render separators. */
  hasDividers: boolean;
  /** Layout direction for direct items. */
  orientation: Orientation;
  /** Whether every item blocks changes without disabled styling. */
  readOnly: boolean;
  /** Default Checkbox size inherited by items. */
  size: CheckboxSize;
  /** Validation tone for the field. */
  status: CheckboxStatus;
}

export interface CheckboxListProps
  extends Omit<BaseUIComponentProps<'div', CheckboxListState>, 'children' | 'asChild'> {
  /** Visible field label. */
  label: JSX.Element;
  /** Supporting text linked to the group. */
  description?: JSX.Element;
  /** Validation text linked to the group. */
  statusMessage?: JSX.Element;
  /** Checkbox List Item children. */
  children: JSX.Element;
  /** Controlled selected values. */
  value?: string[] | undefined;
  /** Initial uncontrolled selected values. @default [] */
  defaultValue?: string[] | undefined;
  /** Runs before an uncontrolled value change commits. */
  onValueChange?: CheckboxGroup.Props['onValueChange'];
  /** All child values used by a parent tri-state Checkbox. */
  allValues?: string[] | undefined;
  /** Whether every item ignores interaction. @default false */
  disabled?: boolean | undefined;
  /** Whether every item blocks changes without disabled styling. @default false */
  readOnly?: boolean | undefined;
  /** Layout direction for direct items. @default 'vertical' */
  orientation?: Orientation | undefined;
  /** Spacing between direct items. @default 'compact' */
  density?: CheckboxGroupDensity | undefined;
  /** Default Checkbox size inherited by items. @default 'md' */
  size?: CheckboxSize | undefined;
  /** Validation tone for the field. @default 'default' */
  status?: CheckboxStatus | undefined;
  /** Whether adjacent items render separators. @default false */
  hasDividers?: boolean | undefined;
}

export namespace CheckboxList {
  export type State = CheckboxListState;
  export type Props = CheckboxListProps;
}
