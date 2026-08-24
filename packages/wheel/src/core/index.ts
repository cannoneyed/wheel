/**
 * wheel/core — the renderer-native service kernel and component bindings.
 *
 * The bottom layer of the package: Service/atoms/computed/action, the DI
 * container, connect() + providers, view(), the stub seam, and the debug
 * registry's recording side. Depends only on solid-js, immer, and XState —
 * nothing from sync, kit, debug, or server.
 */
export {
  Service,
  ServiceContext,
  freezeDeep,
  INHERIT_SCOPE,
  type Atom,
  type ComputedAccessor,
  type ComputedFor,
  type ContextClient,
  type Field,
  type LatestAsyncTask,
  type MachineStateAccessor,
  type MachineTransitionActions,
  type MachineTransitionCreators,
  type ServiceClass,
  type ServiceContextOptions,
  type ServiceMachine,
  type ServiceMachineOptions,
  type ServiceOverrideOptions
} from './services';
export {
  connect,
  makeConnector,
  componentRoot,
  viewRoot,
  WheelProvider,
  ServiceProvider,
  type Connector
} from './connect';
export { isWheelDevMode, setWheelDevMode } from './dev-mode';
export { Show, type ShowProps } from './visibility';
export { useSignal } from './local-state';
export { logger, setLoggerSink, type LogLevel, type LoggerSink } from './logger';
export { StubProvider, stubOf, fakeService, type StubEntry } from './stubs';
export {
  defineStates,
  StateMount,
  type AnyStatesDefinition,
  type ComponentState,
  type StatesDefinition
} from './states';
export {
  view,
  type View,
  type ViewRead,
  type ViewReads,
  type ViewReadValue,
  type ViewActions,
  type ReadableLike
} from './view';
export {
  DebugRegistry,
  type DebugMeta,
  type DebugServiceRecord,
  type ComponentRecord,
  type InstanceRecord,
  type InstanceTreeNode
} from './debug-registry';
export type {
  BridgeActResult,
  BridgeComponentDetail,
  BridgeComponentSummary,
  BridgeErrorEntry,
  BridgeMeta,
  BridgeRect,
  BridgeServiceState,
  WheelBridgeApp,
  WheelGlobal
} from './bridge-contract';
export { canonicalParams, CanonicalParamsError } from './params';
export { captureDeclSite } from './decl-site';
export {
  systemClock,
  systemDefer,
  systemRandomBytes,
  systemRandom01,
  monotonicNowMs,
  type Clock,
  type RandomBytes,
  type Defer
} from './runtime-defaults';
export { retryForever, isAbortError, type RetryFailure, type RetryForeverOptions } from './retry';
