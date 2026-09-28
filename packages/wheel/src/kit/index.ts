/**
 * wheel/kit — batteries-included UI services built on the kernel.
 *
 * Dialog, Command Palette, Context Menu, Keyboard, Focus. Depends on `core`
 * only, never on `sync`: these are local UI-state services, not synced data.
 */
export { DialogService, Dialog, type ConfirmOptions, type OpenDialogEntry } from './dialog';
export { DialogSystem, connectDialogSystem } from './dialog-system';
export {
  ContextMenuService,
  ContextMenuSystem,
  ContextMenu,
  contextMenu,
  isContextMenuKey,
  type ContextMenuBinding,
  type ContextMenuDataBinding,
  type ContextMenuJsxBinding,
  type ContextMenuSystemProps,
  type SubmenuStyle
} from './context-menu';
/**
 * Menus from data — targets, slots, and contributions resolved into the
 * `MenuLevel` that `MenuStack` draws. Command entries take their title,
 * shortcut, check, and reason from `CommandService`.
 */
export {
  MenuService,
  type MenuContribution,
  type MenuEntry,
  type MenuRequest,
  type RuntimeMenuItems
} from './menus';
export { FocusService, focusScope, type FocusScopeBinding } from './focus';
export { KeyboardService, KeyboardSystem, type KeyBinding } from './keyboard';
export {
  detectPlatform,
  findConflicts,
  formatCombo,
  isComposingEvent,
  matchesCombo,
  parseCombo,
  type ComboConflict,
  type ConflictCheckInput,
  type KeyPlatform,
  type ParsedCombo
} from './key-combo';
export {
  CommandService,
  commandsConfigSchema,
  type AnyArgField,
  type ArgField,
  type ArgSpec,
  type ArgsPrompt,
  type ChoiceArgField,
  type CommandContext,
  type CommandEnabled,
  type CommandRequest,
  type CommandSource,
  type CommandSpec,
  type CommandState,
  type ExecuteEvent,
  type ExecuteOptions,
  type ExecuteResult,
  type KeySpec,
  type NumberArgField,
  type TextArgField
} from './commands';
export {
  CommandPaletteService,
  CommandPaletteSystem,
  connectCommandPaletteSystem,
  DEFAULT_PALETTE_OPEN_KEYS,
  groupCommands,
  type Command,
  commandPaletteConfigSchema,
  type CommandGroup
} from './command-palette';
/**
 * Stacked menus — the one model and the one look for a menu with submenus.
 * Choosing a group PUSHES its level onto the stack and the panel redraws in
 * place with a back control; nothing flies out sideways. `createMenuStack`
 * is pure (no DOM, no focus), so a portal context menu and an inline editor
 * `/` menu share it and answer the same keys.
 */
export {
  createMenuStack,
  flattenLeaves,
  menuMatches,
  type GridPoint,
  type MenuAction,
  type MenuGrid,
  type MenuGroup,
  type MenuInput,
  type MenuItem,
  type MenuLevel,
  type MenuStack,
  type MenuStackState
} from './menu-stack';
export { MenuStackPanel, type MenuStackPanelProps } from './menu-stack-panel';
export {
  MenuFlyout,
  OPEN_DELAY_MS,
  SAFE_TRIANGLE_MS,
  insideTriangle,
  type MenuFlyoutProps,
  type Point
} from './menu-flyout';
/**
 * Toasts — a global stack of transient status messages with a per-toast pacing
 * machine so fast sync feedback never flashes: `begin` shows a progress toast,
 * `succeed` resolves it (held at least half a second so a 20ms confirm still
 * reads as "Saving… ✓ Saved"), `flash` shows a self-dismissing message, and
 * `dismiss` fades one out. `<ToastSystem/>` renders the stack (mount once);
 * pass `renderToast` to fully control the look.
 */
export { ToastService, ToastSystem, type Toast, type ToastKind, type ToastState } from './toast';
/**
 * Framing — declarative geometry for app shells. `Frame.Row`/`Frame.Column`
 * are resizable, collapsible splits that register with `LayoutService` by id;
 * `Frame.Drawer` overlays; `Frame.Dock` renders an app-owned split tree with
 * drag-to-dock intents. The service owns geometry only — structure is
 * application JSX.
 */
export { Frame } from './layout/frame-namespace';
export {
  FrameColumn,
  FrameDrawer,
  FrameRow,
  useFrameParent,
  type FrameDrawerProps,
  type FramePixels,
  type FrameSplitProps
} from './layout/frame';
export {
  FrameDock,
  dockEdgeAt,
  type FrameDockLeaf,
  type FrameDockPanelDrag,
  type FrameDockProps
} from './layout/dock';
export {
  LayoutService,
  layoutConfigSchema,
  type LayoutServiceOptions
} from './layout/layout-service';
export {
  applyDockIntent,
  normalizeSplitTree,
  panelIds,
  removePanel,
  type DockEdge,
  type DockIntent,
  type SplitTree
} from './layout/split-tree';
export {
  createGesture,
  type CreateGestureOptions,
  type GestureHandle
} from './layout/gesture-dom';
export {
  Scrollbar,
  thumbGeometry,
  type ScrollbarProps,
  type ScrollMetrics
} from './layout/scrollbar';
export {
  createGestureActor,
  gestureMachine,
  NO_MODIFIERS,
  type GestureActor,
  type GestureCallbacks,
  type GestureDelta,
  type GestureEvent,
  type GestureInput,
  type GestureModifiers
} from './layout/gesture';
export {
  localLayoutStorage,
  memoryLayoutStorage,
  type LayoutStorage
} from './layout/storage';
export {
  parseFrameSize,
  parseLayoutSnapshot,
  type FrameAxis,
  type FrameKind,
  type FrameRegistrationInput,
  type FrameSize,
  type LayoutDiagnostic,
  type LayoutInteraction,
  type LayoutMeasurement,
  type LayoutNode,
  type LayoutNodeSnapshot,
  type LayoutResizeDraft,
  type LayoutSnapshot
} from './layout/model';
