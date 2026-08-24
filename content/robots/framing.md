# Framing

Human page: [Framing](../docs/framing.mdx). API: [`wheel/kit`](api/kit.md).

## Ownership split

- Application JSX and state own which regions exist and their content.
- `LayoutService` owns size, open state, responsive visibility, measurements, active interactions, persistence, and diagnostics.
- Frame ids join JSX, service actions, persistence, and debugging.

## Components

- `Frame.Row`: horizontal split.
- `Frame.Column`: vertical split.
- `Frame.Drawer`: overlay region.
- `Frame.Dock`: renderer for an application-owned `SplitTree`.
- `Scrollbar`: permanent framework scrollbar used by scrollable frames and custom panes.

## Size model

`FrameSize` accepts `<number>px` and `<number>fr`. Parent splits read child sizes. Pixel tracks store resized pixels. Fractional siblings redistribute their combined weight.

`minSize`, `maxSize`, and `collapseBelow` use pixels. Responsive collapse changes effective visibility without changing the user's open preference.

## Registration and reads

- Duplicate ids throw at registration.
- `node(id)` returns a live snapshot or `null`.
- `has(id)` and `visible(id)` return false for missing frames.
- `childOrder(parentId)` follows mounted DOM order.
- Actions throw on unknown ids.

## Persistence

Only deviations from JSX defaults are stored. Current payload shape is a versioned object keyed by frame id. Malformed or wrong-version data is removed and reported through `diagnostics()`.

`LayoutStorage` is synchronous because geometry loads before first paint. Use `localLayoutStorage()` or `memoryLayoutStorage()`.

## Resize and reorder

One separator trails each visible sibling except the last. Pointer and keyboard paths call the same service actions. Active drag state lives in `LayoutService.interaction` and is not persisted until commit.

Reorder gestures return child ids through `onReorder`. The application updates the list that renders those frames.

## Docking

`SplitTree` is plain JSON in application state. `DockIntent` identifies dragged panel, target panel, and edge. `applyDockIntent()` moves and normalizes. `removePanel()`, `normalizeSplitTree()`, and `panelIds()` support editing and validation.

## Gesture engine

`createGesture()` adapts DOM pointer, keyboard, capture, blur, and double-click events to the shared state machine. `createGestureActor()` exposes the headless machine for other inputs and tests.

## Current limits

Framing does not own tabs, view descriptors, synchronized layout state, animations, floating windows, or browser popouts. Use `wheel/components/tabs` for tab content.

Primary sources:

- [`layout-service.ts`](../../packages/wheel/src/kit/layout/layout-service.ts)
- [`frame.tsx`](../../packages/wheel/src/kit/layout/frame.tsx)
- [`split-tree.ts`](../../packages/wheel/src/kit/layout/split-tree.ts)
- [`gesture.ts`](../../packages/wheel/src/kit/layout/gesture.ts)
