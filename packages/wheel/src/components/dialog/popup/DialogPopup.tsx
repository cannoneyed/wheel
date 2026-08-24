/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { useDialogRootContext } from '../root/DialogRootContext';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import type { TransitionStatus } from '../../internals/createTransitionStatus';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import { COMPOSITE_KEYS } from '../../internals/composite/composite';
import { FloatingFocusManager, type InteractionType } from '../../floating-ui-solid/components/FloatingFocusManager';
import { FOCUSABLE_POPUP_PROPS } from '../../utils/popups';
import { useDialogPortalContext } from '../portal/DialogPortalContext';
import { DialogPopupCssVars } from './DialogPopupCssVars';
import { dialogPopupStateAttributesMapping } from './stateAttributesMapping';

/**
 * A container for the dialog contents.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Dialog](https://base-ui.com/react/components/dialog)
 */
export function DialogPopup(componentProps: DialogPopup.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'id',
    'finalFocus',
    'initialFocus',
  ]);

  const store = useDialogRootContext();

  const descriptionElementId = store.useState('descriptionElementId');
  const disablePointerDismissal = store.useState('disablePointerDismissal');
  const floatingRootContext = store.state.floatingRootContext;
  const rootPopupProps = store.useState('popupProps');
  const modal = store.useState('modal');
  const mounted = store.useState('mounted');
  const nested = store.useState('nested');
  const nestedOpenDialogCount = store.useState('nestedOpenDialogCount');
  const open = store.useState('open');
  const openMethod = store.useState('openMethod');
  const titleElementId = store.useState('titleElementId');
  const transitionStatus = store.useState('transitionStatus');
  const role = store.useState('role');
  const floatingId = floatingRootContext.useState('floatingId');

  const popupId = () => local.id ?? floatingId();

  // Throws if not rendered within a `<Dialog.Portal>` — matches upstream.
  useDialogPortalContext();

  let popupElement: HTMLElement | null = null;

  createOpenChangeComplete({
    open,
    getElement: () => popupElement,
    onComplete() {
      if (open()) {
        store.context.onOpenChangeComplete?.(true);
      }
    },
  });

  // Deviation: upstream's `createDefaultInitialFocus` resolver reads a shared `popupRef` object;
  // here it closes over the plain `popupElement` variable set by this component's own ref below
  // (same deviation `TooltipStore`'s doc comment documents for `popupRef`).
  const resolvedInitialFocus = () => {
    if (local.initialFocus !== undefined) {
      return local.initialFocus;
    }
    return (interactionType: InteractionType) => (interactionType === 'touch' ? popupElement : true);
  };

  const nestedDialogOpen = () => nestedOpenDialogCount() > 0;

  const state: DialogPopup.State = {
    get open() {
      return open();
    },
    get nested() {
      return nested();
    },
    get transitionStatus() {
      return transitionStatus();
    },
    get nestedDialogOpen() {
      return nestedDialogOpen();
    },
  };

  const element = renderElement('div', componentProps, {
    defaultClass: 'wheel-Dialog-Popup',
    slot: 'dialog-popup',
    state,
    props: [
      rootPopupProps,
      // This zero-arg thunk is `renderElement`'s reactive-props convention (see CONVENTIONS.md);
      // the lint rule doesn't special-case that custom API and flags the object literal itself.
      () => ({
        id: popupId(),
        'aria-labelledby': titleElementId() ?? undefined,
        'aria-describedby': descriptionElementId() ?? undefined,
        role: role(),
        ...FOCUSABLE_POPUP_PROPS,
        hidden: !mounted(),
        onKeyDown(event: KeyboardEvent) {
          if (COMPOSITE_KEYS.has(event.key)) {
            event.stopPropagation();
          }
        },
        style: {
          [DialogPopupCssVars.nestedDialogs]: nestedOpenDialogCount(),
        },
      }),
      elementProps,
    ],
    ref: (el: HTMLElement | null) => {
      popupElement = el;
      store.set('popupElement', el);
    },
    stateAttributesMapping: dialogPopupStateAttributesMapping,
  });

  return (
    <FloatingFocusManager
      context={floatingRootContext}
      openInteractionType={openMethod()}
      disabled={!mounted()}
      closeOnFocusOut={!disablePointerDismissal()}
      initialFocus={resolvedInitialFocus()}
      returnFocus={local.finalFocus}
      modal={modal() !== false}
      restoreFocus="popup"
    >
      {element}
    </FloatingFocusManager>
  );
}

export interface DialogPopupProps extends BaseUIComponentProps<'div', DialogPopupState> {
  /**
   * Determines the element to focus when the dialog is opened.
   * By default, focus moves to the first tabbable element inside the popup, except when the dialog
   * is opened by touch — then the popup itself is focused to avoid opening the virtual keyboard.
   *
   * - `false`: Do not move focus.
   * - `true`: Move focus based on the default behavior (first tabbable element or popup).
   * - a `{ current }` box: Move focus to the boxed element.
   * - `function`: Called with the interaction type (`mouse`, `touch`, `pen`, or `keyboard`).
   *   Return an element to focus, `true` to use the default behavior, `null` to fall back to the
   *   default behavior, or `false`/`undefined` to do nothing.
   */
  initialFocus?:
    | boolean
    | { current: HTMLElement | null }
    | ((openType: InteractionType) => boolean | HTMLElement | null | void)
    | undefined;
  /**
   * Determines the element to focus when the dialog is closed.
   *
   * - `false`: Do not move focus.
   * - `true`: Move focus based on the default behavior (trigger or previously focused element).
   * - a `{ current }` box: Move focus to the boxed element.
   * - `function`: Called with the interaction type (`mouse`, `touch`, `pen`, or `keyboard`).
   *   Return an element to focus, `true` to use the default behavior, `null` to fall back to the
   *   default behavior, or `false`/`undefined` to do nothing.
   */
  finalFocus?:
    | boolean
    | { current: HTMLElement | null }
    | ((closeType: InteractionType) => boolean | HTMLElement | null | void)
    | undefined;
}

export interface DialogPopupState {
  /**
   * Whether the dialog is currently open.
   */
  open: boolean;
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
  /**
   * Whether the dialog is nested within a parent dialog.
   */
  nested: boolean;
  /**
   * Whether the dialog has nested dialogs open.
   */
  nestedDialogOpen: boolean;
}

export namespace DialogPopup {
  export type Props = DialogPopupProps;
  export type State = DialogPopupState;
}
