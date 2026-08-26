/* eslint-disable wheel/require-view-root -- The catalog owns this fixture composition boundary. */
import { createUniqueId, Show, splitProps, type JSX } from 'solid-js';
import { Checkbox } from 'wheel/components';
import type { CheckboxRootProps } from 'wheel/components/checkbox';

interface CheckboxControlProps extends CheckboxRootProps {
  readonly label: JSX.Element;
  readonly description?: JSX.Element;
  readonly endContent?: JSX.Element;
}

export function CheckboxControl(componentProps: CheckboxControlProps): JSX.Element {
  const [local, rootProps] = splitProps(componentProps, ['description', 'endContent', 'label']);
  const labelId = createUniqueId();
  const descriptionId = createUniqueId();
  return (
    <label class="checkbox-demo-control">
      <Checkbox.Root
        {...rootProps}
        aria-describedby={local.description === undefined ? undefined : descriptionId}
        aria-labelledby={labelId}
      >
        <Checkbox.Indicator>
          <CheckboxMark />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <span class="checkbox-demo-control__content">
        <span id={labelId}>{local.label}</span>
        <Show when={local.description !== undefined}>
          <small id={descriptionId}>{local.description}</small>
        </Show>
      </span>
      <Show when={local.endContent !== undefined}>
        <span class="checkbox-demo-control__end">{local.endContent}</span>
      </Show>
    </label>
  );
}

export function CheckboxMark(): JSX.Element {
  return (
    <>
      <svg
        class="checkbox-demo-check"
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
      >
        <path d="m2.5 8.5 4 4 7-9" />
      </svg>
      <span class="checkbox-demo-mixed" aria-hidden="true" />
    </>
  );
}
