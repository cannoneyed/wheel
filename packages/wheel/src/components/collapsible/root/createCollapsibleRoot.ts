/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createMemo, createSignal, untrack, type Accessor } from 'solid-js';
import { createControllableSignal } from '../../base-utils/createControllableSignal';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import {
  createTransitionStatus,
  type TransitionStatus,
} from '../../internals/createTransitionStatus';
import type { CollapsibleRoot } from './CollapsibleRoot';

export interface CreateCollapsibleRootParameters {
  /**
   * Whether the collapsible panel is currently open (controlled).
   */
  open?: Accessor<boolean | undefined> | undefined;
  /**
   * Whether the collapsible panel is initially open (uncontrolled). Read once at setup.
   * @default false
   */
  defaultOpen?: Accessor<boolean | undefined> | undefined;
  /**
   * Event handler called when the panel is opened or closed.
   */
  onOpenChange: (open: boolean, eventDetails: CollapsibleRoot.ChangeEventDetails) => void;
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: Accessor<boolean>;
}

export interface CreateCollapsibleRootReturnValue {
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: Accessor<boolean>;
  handleTrigger: (event: MouseEvent | KeyboardEvent) => void;
  /**
   * Whether the collapsible panel is mounted for transition and hidden-state
   * purposes. This can be `false` while the element remains in the DOM when
   * `keepMounted` or `hiddenUntilFound` is enabled.
   */
  mounted: Accessor<boolean>;
  /**
   * Whether the collapsible panel is currently open.
   */
  open: Accessor<boolean>;
  panelId: Accessor<string | undefined>;
  setMounted: (nextMounted: boolean) => void;
  setOpen: (open: boolean) => void;
  setPanelIdState: (id: string | undefined) => void;
  transitionStatus: Accessor<TransitionStatus>;
}

/**
 * Solid port of upstream's `useCollapsibleRoot`.
 */
export function createCollapsibleRoot(
  parameters: CreateCollapsibleRootParameters,
): CreateCollapsibleRootReturnValue {
  const { onOpenChange, disabled } = parameters;

  const [open, setOpen] = createControllableSignal<boolean>({
    controlled: () => parameters.open?.(),
    default: Boolean(untrack(() => parameters.defaultOpen?.())),
    name: 'Collapsible',
    state: 'open',
  });

  const { mounted, setMounted, transitionStatus } = createTransitionStatus(
    open,
    () => true,
    () => true,
  );

  const defaultPanelId = createBaseUiId();
  const [panelIdState, setPanelIdState] = createSignal<string | undefined>(undefined);
  const panelId = createMemo(() => panelIdState() ?? defaultPanelId());

  const handleTrigger = (event: MouseEvent | KeyboardEvent) => {
    const nextOpen = !open();
    const eventDetails = createChangeEventDetails(REASONS.triggerPress, event);

    onOpenChange(nextOpen, eventDetails);

    if (eventDetails.isCanceled) {
      return;
    }

    setOpen(nextOpen);
  };

  return {
    disabled,
    handleTrigger,
    mounted,
    open,
    panelId,
    setMounted,
    setOpen,
    setPanelIdState,
    transitionStatus,
  };
}
