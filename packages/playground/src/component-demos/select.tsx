/* eslint-disable wheel/require-view-root -- The catalog owns this fixture composition boundary. */
import type { JSX } from 'solid-js';
import { Select, type SelectSize, type SelectStatus, type SelectVariant } from 'wheel/components';

import { DemoGroup } from './demo-group';

export const apples = [
  { label: 'Gala', value: 'gala' },
  { label: 'Fuji', value: 'fuji' },
  { label: 'Honeycrisp', value: 'honeycrisp' },
  { label: 'Granny Smith', value: 'granny-smith' },
  { label: 'Pink Lady', value: 'pink-lady' },
];

interface AppleSelectProps {
  readonly label: string;
  readonly placeholder?: string | undefined;
  readonly defaultValue?: string | undefined;
  readonly size?: SelectSize | undefined;
  readonly status?: SelectStatus | undefined;
  readonly variant?: SelectVariant | undefined;
  readonly disabled?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
  readonly testId?: string | undefined;
}

/** Renders the complete Select composition used by stage and reference examples. */
export function AppleSelect(props: AppleSelectProps): JSX.Element {
  return (
    <div class="select-demo-control">
      <Select.Root
        items={apples}
        defaultValue={props.defaultValue}
        size={props.size}
        status={props.status}
        variant={props.variant}
        disabled={props.disabled}
        readOnly={props.readOnly}
      >
        <Select.Label>{props.label}</Select.Label>
        <Select.Trigger data-testid={props.testId ? `${props.testId}-trigger` : undefined}>
          <Select.Value placeholder={props.placeholder ?? 'Select apple'} />
          <Select.Icon><CaretUpDownIcon /></Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner sideOffset={4}>
            <Select.Popup data-testid={props.testId ? `${props.testId}-popup` : undefined}>
              <Select.ScrollUpArrow><CaretUpIcon /></Select.ScrollUpArrow>
              <Select.List>
                {apples.map(({ label, value }) => (
                  <Select.Item value={value}>
                    <Select.ItemIndicator><CheckIcon /></Select.ItemIndicator>
                    <Select.ItemText>{label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.List>
              <Select.ScrollDownArrow><CaretDownIcon /></Select.ScrollDownArrow>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

export default function ExampleSelect() {
  return (
    <div class="select-family-fixture">
      <DemoGroup title="Surfaces" description="Input and ghost surfaces keep the same behavior.">
        <AppleSelect label="Input" testId="select" />
        <AppleSelect label="Ghost" variant="ghost" defaultValue="gala" />
      </DemoGroup>

      <DemoGroup title="Sizes" description="The trigger and its options share one density.">
        <AppleSelect label="Small" size="sm" defaultValue="fuji" />
        <AppleSelect label="Medium" size="md" defaultValue="honeycrisp" />
        <AppleSelect label="Large" size="lg" defaultValue="pink-lady" />
      </DemoGroup>

      <DemoGroup title="Validation status">
        <AppleSelect label="Success" status="success" defaultValue="gala" />
        <AppleSelect label="Warning" status="warning" defaultValue="fuji" />
        <AppleSelect label="Error" status="error" defaultValue="granny-smith" />
      </DemoGroup>

      <DemoGroup title="Constraints">
        <AppleSelect label="Disabled" disabled defaultValue="gala" />
        <AppleSelect label="Read only" readOnly defaultValue="fuji" />
      </DemoGroup>
    </div>
  );
}

function CaretUpDownIcon(props: JSX.IntrinsicElements['svg']) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M11 10H5l3 3.5zm0-4H5l3-3.5z" />
    </svg>
  );
}

function CheckIcon(props: JSX.IntrinsicElements['svg']) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true" {...props}>
      <path d="m2.5 8.5 4 4 7-9" />
    </svg>
  );
}

function CaretUpIcon(props: JSX.IntrinsicElements['svg']) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 10H4l4-4.5z" />
    </svg>
  );
}

function CaretDownIcon(props: JSX.IntrinsicElements['svg']) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 6H4l4 4.5z" />
    </svg>
  );
}
