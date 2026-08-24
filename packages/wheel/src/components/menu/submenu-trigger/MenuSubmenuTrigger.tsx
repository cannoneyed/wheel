/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { EMPTY_OBJECT } from '../../base-utils/empty';
import { splitProps, type JSX } from 'solid-js';
import { safePolygon, useClick, useHoverReferenceInteraction } from '../../floating-ui-solid';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { createCompositeListItem } from '../../internals/composite';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps, NonNativeButtonProps } from '../../internals/types';
import { triggerOpenStateMapping } from '../../utils/popupStateMapping';
import { createTriggerRegistration } from '../../utils/popups';
import { useMenuRootContext } from '../root/MenuRootContext';
import { useMenuPositionerContext } from '../positioner/MenuPositionerContext';
import { useMenuSubmenuRootContext } from '../submenu-root/MenuSubmenuRootContext';
import { createMenuItem, type UseMenuItemMetadata } from '../item/createMenuItem';

/**
 * A menu item that opens a submenu.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 *
 * Deviation: no Menubar integration (`openOnHover` default derivation from a Menubar's
 * `hasSubmenuOpen` state is dropped along with Menubar support — see `MenuRoot.tsx`'s doc
 * comment). Trigger registration relies on `createImplicitActiveTrigger` (already running in this
 * submenu's own `Menu.Root`) to claim this element as the active trigger once it's the only
 * registered one, rather than reproducing upstream's extra "claim self if already open with no
 * active trigger" mount-time special case (a detached-trigger edge case not exercised here).
 */
export function MenuSubmenuTrigger(componentProps: MenuSubmenuTrigger.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'label',
    'id',
    'delay',
    'closeDelay',
    'openOnHover',
    'nativeButton',
  ]);

  const listItem = createCompositeListItem({ label: () => local.label });
  const menuPositionerContext = useMenuPositionerContext();
  const { store } = useMenuRootContext();
  const submenuRootContext = useMenuSubmenuRootContext();

  if (!submenuRootContext) {
    throw new Error('Base UI: <Menu.SubmenuTrigger> must be placed in <Menu.SubmenuRoot>.');
  }

  const parentMenuStore = submenuRootContext.parentMenu;

  const thisTriggerId = createBaseUiId(() => local.id);
  const open = store.useState('open');
  const floatingRootContext = store.state.floatingRootContext;
  const floatingTreeRoot = store.useState('floatingTreeRoot');
  const popupId = store.useState('triggerPopupId', thisTriggerId);
  const hoverEnabled = store.useState('hoverEnabled');

  const triggerElementRef: { current: Element | null } = { current: null };
  const registerTrigger = createTriggerRegistration(thisTriggerId, store);

  const rootDisabled = store.useState('disabled');
  const parentDisabled = parentMenuStore.useState('disabled');
  const disabled = () => (local.disabled ?? false) || rootDisabled() || parentDisabled();

  const highlighted = parentMenuStore.useState('isActive', listItem.index);
  const parentItemProps = parentMenuStore.useState('itemProps');

  const itemMetadata: UseMenuItemMetadata = {
    type: 'submenu-trigger',
    setActive() {
      if (parentMenuStore.state.highlightItemOnHover) {
        parentMenuStore.set('activeIndex', listItem.index());
      }
    },
  };

  const nativeButton = () => local.nativeButton ?? false;

  const { getItemProps, itemRef } = createMenuItem({
    closeOnClick: () => false,
    disabled,
    highlighted,
    id: thisTriggerId,
    nativeButton,
    itemMetadata,
    nodeId: menuPositionerContext.context.nodeId,
    store,
    typingRef: parentMenuStore.context.typingRef,
  });

  const openOnHover = () => local.openOnHover ?? true;
  const delay = () => local.delay ?? 100;
  const closeDelay = () => local.closeDelay ?? 0;

  store.syncValue('closeDelay', closeDelay);

  const hoverProps = useHoverReferenceInteraction(floatingRootContext, {
    enabled: () => hoverEnabled() && openOnHover() && !disabled(),
    handleClose: safePolygon({ blockPointerEvents: true }),
    mouseOnly: () => true,
    move: () => true,
    restMs: delay,
    delay: () => ({ open: delay(), close: closeDelay() }),
    triggerElementRef,
    externalTree: floatingTreeRoot(),
    isClosing: () => store.state.transitionStatus === 'ending',
    shouldOpen: () => (delay() > 0 ? parentMenuStore.state.allowMouseEnter : true),
    guardStaleOpen: () => true,
  });

  const click = useClick(floatingRootContext, {
    enabled: () => !disabled(),
    event: () => 'mousedown',
    toggle: () => !openOnHover(),
    ignoreMouse: openOnHover,
    stickIfOpen: () => false,
  });

  const rootTriggerPropsRaw = store.useState('triggerProps', true);
  const rootTriggerProps = () => {
    const p = { ...rootTriggerPropsRaw() };
    delete (p as Record<string, unknown>).id;
    return p;
  };

  const state: MenuSubmenuTrigger.State = {
    get disabled() {
      return disabled();
    },
    get highlighted() {
      return highlighted();
    },
    get open() {
      return open();
    },
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Menu-SubmenuTrigger',
    slot: 'menu-submenu-trigger',
    state,
    ref: [
      itemRef,
      listItem.ref,
      registerTrigger,
      (el: Element | null) => {
        triggerElementRef.current = el;
      },
    ],
    props: [
      click.reference,
      () => hoverProps() ?? EMPTY_OBJECT,
      rootTriggerProps,
      parentItemProps,
      () => ({
        'aria-controls': popupId(),
        onBlur() {
          if (highlighted()) {
            parentMenuStore.set('activeIndex', null);
          }
        },
      }),
      elementProps,
      getItemProps,
    ],
    stateAttributesMapping: triggerOpenStateMapping,
  });
}

export interface MenuSubmenuTriggerState {
  /**
   * Whether the trigger is disabled.
   */
  disabled: boolean;
  /**
   * Whether the trigger is highlighted.
   */
  highlighted: boolean;
  /**
   * Whether the submenu is currently open.
   */
  open: boolean;
}

export interface MenuSubmenuTriggerProps
  extends NonNativeButtonProps,
    BaseUIComponentProps<'div', MenuSubmenuTriggerState> {
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * Overrides the text label used for typeahead matching.
   */
  label?: string | undefined;
  /**
   * How long to wait before the menu may be opened on hover. Specified in milliseconds.
   * Requires the `openOnHover` prop.
   * @default 100
   */
  delay?: number | undefined;
  /**
   * How long to wait before closing the menu that was opened on hover. Specified in milliseconds.
   * Requires the `openOnHover` prop.
   * @default 0
   */
  closeDelay?: number | undefined;
  /**
   * Whether the submenu should also open when the trigger is hovered.
   * @default true
   */
  openOnHover?: boolean | undefined;
}

export namespace MenuSubmenuTrigger {
  export type State = MenuSubmenuTriggerState;
  export type Props = MenuSubmenuTriggerProps;
}
