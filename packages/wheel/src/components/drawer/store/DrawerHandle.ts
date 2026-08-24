import { DrawerStore, createNullDrawerStore, type DrawerHandleStore } from './DrawerStore';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { BasePopupHandle } from '../../utils/popups/popupHandle';
import { warn } from '../../base-utils/warn';

/**
 * Controls a Drawer imperatively and associates detached `Drawer.Trigger` components with a
 * `Drawer.Root`. Create one with `Drawer.createHandle()` and pass it to the `handle` prop of the
 * root and of any triggers rendered outside of it.
 *
 * The imperative methods take effect only while a root using this handle is mounted; calls made
 * before a root attaches (or after it unmounts) are ignored.
 *
 * Deviation: upstream's `DrawerHandle` extends `DialogHandle` (Drawer shares `DialogStore`
 * upstream). This Solid port's `Dialog.Root`/`DialogStore` don't support a `handle` prop at all
 * (see `DrawerStore`'s doc comment), so `DrawerHandle` extends `BasePopupHandle` directly instead —
 * the same base class `DialogHandle`/`PreviewCardHandle` extend — rather than a `DialogHandle` this
 * port doesn't have.
 */
export class DrawerHandle<Payload> extends BasePopupHandle<
  DrawerHandleStore<Payload>,
  DrawerStore<Payload>
> {
  constructor() {
    super(createNullDrawerStore<Payload>(), 'Drawer', false);
  }

  /**
   * Opens the drawer, optionally associating it with a trigger.
   *
   * This method should only be called in an event handler or an effect (not during setup).
   *
   * @param triggerId ID of the trigger to associate with the drawer. The trigger must be a
   * matching `Drawer.Trigger` with this handle passed as a prop. Pass `null` to open without
   * associating any trigger.
   */
  open(triggerId: string | null) {
    this.openByTrigger(triggerId);
  }

  /**
   * Opens the drawer with the given payload, without associating it with any trigger.
   *
   * This method should only be called in an event handler or an effect (not during setup).
   *
   * @param payload Payload to set when opening the drawer. It is exposed to the root's render-prop
   * children.
   */
  openWithPayload(payload: Payload) {
    const attachedStore = this.attachedStore;

    if (attachedStore === null) {
      if (process.env.NODE_ENV !== 'production') {
        warn(
          'Base UI: DrawerHandle.openWithPayload() was called while no root using this handle is mounted. ' +
            'The call and its payload were ignored; mount a root with this handle before opening it imperatively.',
        );
      }
      return;
    }

    attachedStore.set('payload', payload);
    attachedStore.setOpen(
      true,
      createChangeEventDetails(REASONS.imperativeAction, undefined, undefined),
    );
  }

  /**
   * Closes the drawer.
   *
   * This method should only be called in an event handler or an effect (not during setup).
   */
  close() {
    this.closePopup();
  }

  /**
   * Whether the drawer is currently open. Returns `false` while no root is attached to the handle.
   */
  get isOpen() {
    return this.attachedStore?.useState('open')() ?? false;
  }
}

/**
 * Creates a new handle to connect a `Drawer.Root` with detached `Drawer.Trigger` components.
 */
export function createDrawerHandle<Payload>(): DrawerHandle<Payload> {
  return new DrawerHandle<Payload>();
}
