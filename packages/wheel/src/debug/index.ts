/**
 * wheel/debug — the rendering side of the debug surfaces.
 *
 * The debug panel and the on-screen inspector. Depends on `core` (the debug
 * registry it reads) and `sync` (the client status/provenance it renders).
 */
export { WheelApp } from './wheel-app';
export { WheelDebugPanel } from './debug-panel';
export {
  SnapshotService,
  SnapshotSystem,
  SnapshotCard,
  setSnapshotCapture,
  captureViewportRegion,
  tabCaptureStream,
  type SnapshotComponent,
  type SnapshotContext,
  type StagedSnapshot
} from './snapshot';
export {
  startErrorCapture,
  activeErrorLog,
  formatEntry,
  ErrorLog,
  type CapturedError
} from './error-capture';
export { InspectorService, InspectorSystem, type InspectorHit, type SelectionRect } from './inspector';
export {
  installWheelBridge,
  type WheelBridgeApp,
  type WheelGlobal,
  type BridgeActResult,
  type BridgeComponentDetail,
  type BridgeComponentSummary,
  type BridgeErrorEntry,
  type BridgeMeta,
  type BridgeRect,
  type BridgeServiceState
} from './bridge';
