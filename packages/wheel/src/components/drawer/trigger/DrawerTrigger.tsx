/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { useSignal } from '../../../core/local-state';
import { createEffect, onCleanup, splitProps, untrack, type Accessor, type JSX } from 'solid-js';
import { useDrawerRootContext } from '../root/DrawerRootContext';
import { createButton } from '../../internals/use-button/createButton';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps, HTMLProps, NativeButtonProps } from '../../internals/types';
import { triggerOpenStateMapping } from '../../utils/popupStateMapping';
import {
  createTriggerDataForwarding,
  usePopupHandleStore,
  type PopupRootStore,
} from '../../utils/popups';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { useClick, type ElementProps } from '../../floating-ui-solid';
import { createOpenMethodTriggerProps } from '../../utils/useOpenInteractionType';
import type { DrawerHandle } from '../store/DrawerHandle';
import {
  type DrawerHandleStore,
  type DrawerStore,
  type State as DrawerStoreState,
} from '../store/DrawerStore';

/**
 * A button that opens the drawer.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Drawer](https://base-ui.com/react/components/drawer)
 *
 * Deviation: upstream re-exports `Dialog.Trigger` directly (`export const DrawerTrigger =
 * DialogTrigger`), which doesn't support a `handle` prop (`Dialog.Trigger` upstream does, but this
 * Solid port's `Dialog.Trigger` cuts it — see its doc comment). Drawer needs its own detached-trigger
 * machinery regardless (it can't reuse `Dialog.Trigger`'s, since Drawer owns a separate `DrawerStore`
 * — see `DrawerStore`'s doc comment), so this component supports `handle` directly, mirroring
 * `PreviewCardTrigger`'s reactive store-resolution pattern (see its doc comment for the full
 * rationale: a detached trigger can mount before the handle's root has attached, so the resolved
 * store must be re-read reactively rather than once at setup).
 */
export function DrawerTrigger<Payload = unknown>(
  componentProps: DrawerTrigger.Props<Payload>,
): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'payload',
    'disabled',
    'nativeButton',
    'id',
    'handle',
  ]);

  const rootContext = useDrawerRootContext(true);
  const handleStore = usePopupHandleStore<DrawerHandleStore<unknown>>(() => local.handle);

  function resolveStore(): DrawerHandleStore<unknown> | DrawerStore<unknown> {
    const fromHandle = handleStore();
    if (fromHandle !== undefined) {
      return fromHandle;
    }
    if (rootContext !== undefined) {
      return rootContext;
    }
    throw new Error(
      'Base UI: <Drawer.Trigger> must be either used within a <Drawer.Root> component or provided with a handle.',
    );
  }

  const thisTriggerId = createBaseUiId(() => local.id);
  const triggerElementRef: { current: Element | null } = { current: null };

  const disabled = () => local.disabled ?? false;
  const nativeButton = () => local.nativeButton ?? true;

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    native: nativeButton,
  });

  const [isMountedByThisTrigger, setIsMountedByThisTrigger] = useSignal<Accessor<boolean>>(
    () => false, 'isMountedByThisTrigger');
  const [clickProps, setClickProps] = useSignal<ElementProps['reference']>({}, 'clickProps');
  const [openMethodProps, setOpenMethodProps] = useSignal<HTMLProps>({}, 'openMethodProps');

  // (Re)binds registration, click, and open-method interactions whenever the resolved store's
  // identity changes. See this file's doc comment for why a one-time setup isn't sufficient.
  createEffect(() => {
    const store = resolveStore();

    const { registerTrigger, isMountedByThisTrigger: mountedByThisTrigger } =
      createTriggerDataForwarding(
        thisTriggerId,
        triggerElementRef,
        // `store`'s narrowed handle-store type intentionally omits `setOpen`/`syncValue` (see
        // `DrawerHandleStore`'s/`PreviewCardHandleStore`'s doc comment) — neither is called by
        // `createTriggerDataForwarding`. Reported as a shared-infra type gap, same as
        // `PreviewCardTrigger`.
        store as unknown as PopupRootStore<DrawerStoreState<unknown>>,
        () => ({ payload: local.payload }),
      );
    setIsMountedByThisTrigger(() => mountedByThisTrigger);

    // See `PreviewCardTrigger`'s doc comment: `registerTrigger`/its `onCleanup` counterpart
    // synchronously read and write plain store fields meant to be read from a non-tracking
    // context; `untrack` keeps those from becoming a dependency of (and thereby infinitely
    // re-triggering) this effect.
    untrack(() => {
      if (triggerElementRef.current) {
        registerTrigger(triggerElementRef.current);
      }
    });
    onCleanup(() => untrack(() => registerTrigger(null)));

    const floatingRootContext = store.useState('floatingRootContext')();
    const click = useClick(floatingRootContext);
    setClickProps(() => click.reference ?? {});

    const openAccessor = store.useState('open');
    const triggerProps = createOpenMethodTriggerProps(openAccessor, (interactionType) => {
      store.set('openMethod', interactionType);
    });
    setOpenMethodProps(triggerProps);
  });

  const isOpenedByThisTrigger = () => resolveStore().useState('isOpenedByTrigger', thisTriggerId())();
  const popupId = () => resolveStore().useState('triggerPopupId', thisTriggerId())();
  const rootTriggerProps = () =>
    resolveStore().useState('triggerProps', isMountedByThisTrigger())() ?? {};

  const state: DrawerTrigger.State = {
    get disabled() {
      return disabled();
    },
    get open() {
      return isOpenedByThisTrigger();
    },
  };

  return renderElement('button', componentProps, {
    defaultClass: 'wheel-Drawer-Trigger',
    slot: 'drawer-trigger',
    state,
    ref: [
      buttonRef,
      (el: Element | null) => {
        triggerElementRef.current = el;
      },
    ],
    props: [
      () => clickProps() ?? {},
      () => openMethodProps() ?? {},
      rootTriggerProps,
      () => ({
        id: thisTriggerId(),
        'aria-haspopup': 'dialog' as const,
        'aria-expanded': isOpenedByThisTrigger(),
        'aria-controls': popupId(),
      }),
      elementProps,
      getButtonProps,
    ],
    stateAttributesMapping: triggerOpenStateMapping,
  });
}

export interface DrawerTriggerState {
  /**
   * Whether the trigger is currently disabled.
   */
  disabled: boolean;
  /**
   * Whether the drawer is currently open and was opened by this trigger.
   */
  open: boolean;
}

export interface DrawerTriggerProps<Payload = unknown>
  extends NativeButtonProps, BaseUIComponentProps<'button', DrawerTriggerState> {
  /**
   * A handle to associate the trigger with a drawer.
   * Can be created with `Drawer.createHandle()`.
   */
  handle?: DrawerHandle<Payload> | undefined;
  /**
   * A payload to pass to the drawer when it is opened.
   */
  payload?: Payload | undefined;
  /**
   * ID of the trigger. In addition to being forwarded to the rendered element,
   * it is also used to specify the active trigger for the drawer in controlled mode (with the
   * `Drawer.Root` `triggerId` prop).
   */
  id?: string | undefined;
}

export namespace DrawerTrigger {
  export type Props<Payload = unknown> = DrawerTriggerProps<Payload>;
  export type State = DrawerTriggerState;
}
