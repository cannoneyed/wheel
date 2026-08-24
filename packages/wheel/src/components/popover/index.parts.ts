export { PopoverRoot as Root } from './root/PopoverRoot';
export { PopoverTrigger as Trigger } from './trigger/PopoverTrigger';
export { PopoverPortal as Portal } from './portal/PopoverPortal';
export { PopoverPositioner as Positioner } from './positioner/PopoverPositioner';
export { PopoverPopup as Popup } from './popup/PopoverPopup';
export { PopoverArrow as Arrow } from './arrow/PopoverArrow';
export { PopoverBackdrop as Backdrop } from './backdrop/PopoverBackdrop';
export { PopoverTitle as Title } from './title/PopoverTitle';
export { PopoverDescription as Description } from './description/PopoverDescription';
export { PopoverClose as Close } from './close/PopoverClose';
// Deviation: `Popover.Handle`/`createHandle` (detached-trigger machinery) and `Popover.Viewport`
// are not ported — see `root/PopoverRoot.tsx`'s and `positioner/PopoverPositioner.tsx`'s doc
// comments for the corresponding cuts on the consuming side.
