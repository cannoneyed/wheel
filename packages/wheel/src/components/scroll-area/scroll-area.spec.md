# Scroll Area behavior specification

- Scroll Area preserves native scrolling while adding styled horizontal and vertical scrollbars.
- Root composes Viewport, Scrollbar, Thumb, and Corner parts.
- Viewport remains the scroll container and preserves native wheel, trackpad, touch, keyboard, and programmatic scrolling.
- Scrollbars appear only for axes whose content overflows unless the caller forces them visible.
- Thumb size reflects the viewport-to-content ratio and retains a usable minimum target.
- Dragging Thumb captures the pointer and maps movement to scroll offset without text selection.
- Clicking a track pages toward the pointer. Holding the track may repeat at a bounded rate.
- Corner fills only when both axes and both scrollbar gutters meet.
- Scrollbars support overlay and reserved-gutter treatments.
- Compact and comfortable thickness variants do not change the content size in overlay mode.
- Right-to-left horizontal scroll normalizes browser offset differences.
- ScrollArea never traps keyboard focus. Viewport is focusable only when native overflow needs a keyboard target.
- Scrollbars appear immediately when needed and use only exit fade when auto-hiding.
- Reduced motion removes auto-hide fades. Forced colors preserves track, thumb, and focus visibility.
