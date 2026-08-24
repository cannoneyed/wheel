# Debugging

Human page: [Debugging](../docs/debugging.mdx). API: [`wheel/debug`](api/debug.md), [`wheel/testing`](api/testing.md), [`wheel/vite`](api/vite.md).

## Mounts

- `WheelApp` mounts providers and all development debug systems.
- `WheelDebugPanel` mounts the floating panel when a host already owns providers.
- `InspectorSystem` renders point and rectangle inspection UI.
- `SnapshotSystem` renders snapshot selection and staging UI.
- `installWheelBridge()` installs the programmatic bridge directly.

Development mode comes from `wheelDevTools()` during Vite serve. A production host can opt in explicitly with `setWheelDevMode(true)`.

## Bridge reads

- `errors()`: captured errors.
- `meta()`: sync sequence, pending writes, connection, mounted count.
- `state()`: services and primitive values.
- `components()`: mounted component tree.
- `component(id)`: one instance with props, local state, connected state, actions, and rectangles.
- `find(query)`: id and name search.
- `tables()`: effective client rows.
- `writes()`: provenance log.

## Bridge writes

- `act(instanceId, action, args)` invokes a connected action.
- `actService(serviceName, action, args)` invokes a registered service action.
- The bridge does not expose direct atom writes.

## Driver behavior

`wheelDriver(page)` wraps bridge calls for Node and Playwright. Every call checks the capture buffer. New error-level entries throw `WheelAppError` unless the driver explicitly ignores app errors.

## Error capture

`startErrorCapture()` installs a shared window ring buffer. It records uncaught exceptions, unhandled rejections, and Wheel logger warnings or errors. Development mode also patches raw console warnings and errors.

`activeErrorLog()` returns the installed buffer. `formatEntry()` returns one stable text block.

## Snapshots

`SnapshotService` owns select, stage, copy, save, and discard state. `SnapshotCard` renders a staged capture. `setSnapshotCapture()` replaces the pixel-capture seam for hosts or tests.

Saving through `wheelDevTools({ snapshotDir })` writes:

```text
<snapshotDir>/<epoch>-<name>/
  shot.png
  context.json
```

The JSON contains components and live state under the selected rectangle.

## Component states

`defineStates()` checks named stub shapes against one connection. `StateMount` renders a selected shape through `StubProvider`. The playground discovers `*.states.tsx` files.

Primary sources:

- [`bridge.ts`](../../packages/wheel/src/debug/bridge.ts)
- [`snapshot.tsx`](../../packages/wheel/src/debug/snapshot.tsx)
- [`error-capture.ts`](../../packages/wheel/src/debug/error-capture.ts)
- [`driver.ts`](../../packages/wheel/src/testing/driver.ts)
