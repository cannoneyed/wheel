import { FloatingRootStore } from '../../floating-ui-solid/components/FloatingRootStore';
import { PopupTriggerMap } from '../../utils/popups/popupTriggerMap';
import type { FloatingRootContext } from '../../floating-ui-solid';

/**
 * Solid port of upstream's `getEmptyRootContext`. Returns a harmless, always-closed
 * `FloatingRootContext` for hooks (`useDismiss`, `useHoverFloatingInteraction`) that need a
 * context object before any trigger has claimed the shared one (e.g. `NavigationMenu.List`
 * before any item is active).
 */
export function getEmptyRootContext(): FloatingRootContext {
  return new FloatingRootStore({
    open: false,
    transitionStatus: undefined,
    referenceElement: null,
    floatingElement: null,
    triggerElements: new PopupTriggerMap(),
    floatingId: undefined,
    syncOnly: false,
    nested: false,
    onOpenChange: undefined,
  });
}
