/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { isElement } from '@floating-ui/utils/dom';
import { createComputed, type Accessor } from 'solid-js';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { access, type MaybeAccessor } from '../../internals/types';
import { PopupTriggerMap } from '../../utils/popups/popupTriggerMap';
import type { BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { useFloatingParentNodeId } from '../components/FloatingTree';
import { FloatingRootStore, type FloatingRootState } from '../components/FloatingRootStore';
import type { ReferenceType } from '../types';
import { error } from '../../base-utils/error';

export interface UseFloatingRootContextOptions {
  open?: MaybeAccessor<boolean | undefined>;
  onOpenChange?(open: boolean, eventDetails: BaseUIChangeEventDetails<string>): void;
  elements?:
    | {
        reference?: MaybeAccessor<ReferenceType | null | undefined>;
        floating?: MaybeAccessor<HTMLElement | null | undefined>;
      }
    | undefined;
}

/**
 * Solid port of upstream's `useFloatingRootContext`.
 *
 * Upstream builds the store once via `useRefWithInit` and re-syncs it every
 * render through a layout effect. In Solid, a hook's setup code runs exactly
 * once, so the store is plain-constructed here (no `useRefWithInit` needed),
 * and `store.syncValue`/`createComputed` take over the job of the layout
 * effect: they re-run whenever the underlying accessors change, keeping
 * `open`/`floatingId`/the externally-controlled elements in sync with the
 * store.
 */
export function useFloatingRootContext(options: UseFloatingRootContextOptions): FloatingRootStore {
  const open: Accessor<boolean> = () => access(options.open) ?? false;
  const referenceOption = () => access(options.elements?.reference);
  const floatingOption = () => access(options.elements?.floating);

  const floatingId = createBaseUiId();
  const nested = useFloatingParentNodeId() != null;

  if (process.env.NODE_ENV !== 'production') {
    const optionDomReference = referenceOption();
    if (optionDomReference && !isElement(optionDomReference)) {
      error(
        'Cannot pass a virtual element to the `elements.reference` option,',
        'as it must be a real DOM element. Use `context.setPositionReference()`',
        'instead.',
      );
    }
  }

  const store = new FloatingRootStore({
    open: open(),
    transitionStatus: undefined,
    onOpenChange: options.onOpenChange,
    referenceElement: referenceOption() ?? null,
    floatingElement: floatingOption() ?? null,
    triggerElements: new PopupTriggerMap(),
    floatingId: floatingId(),
    syncOnly: false,
    nested,
  });

  store.syncValue('open', open);
  store.syncValue('floatingId', floatingId);

  // Only sync elements that are defined, to avoid overwriting values set
  // through `refs.setReference`/`refs.setFloating` elsewhere.
  createComputed(() => {
    const referenceValue = referenceOption();
    const floatingValue = floatingOption();

    const valuesToSync: Partial<FloatingRootState> = {};
    if (referenceValue !== undefined) {
      valuesToSync.referenceElement = referenceValue;
      valuesToSync.domReferenceElement = isElement(referenceValue) ? referenceValue : null;
    }
    if (floatingValue !== undefined) {
      valuesToSync.floatingElement = floatingValue;
    }

    if (Object.keys(valuesToSync).length > 0) {
      store.update(valuesToSync);
    }
  });

  store.context.onOpenChange = options.onOpenChange;
  store.context.nested = nested;

  return store;
}
