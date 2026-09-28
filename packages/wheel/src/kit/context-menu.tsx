/**
 * The context-menu system: "globally rendered, locally connected."
 *
 * Three layers:
 * - `use:contextMenu` directive (primary) / `<ContextMenu>` (fallback for
 *   component roots): declared AT the trigger site, registering an id, the
 *   trigger element, and a lazy `menu` thunk. Closed menus mount nothing.
 * - `ContextMenuService`: the global awareness — a scalar `open` atom makes
 *   single-open true by construction; registrations and the anchor are
 *   inspectable in the debug panel.
 * - `<ContextMenuSystem/>` (mounted once): the Portal, positioning
 *   (@floating-ui/dom: flip/shift/clamp, scroll-aware), scrim, Escape, and
 *   focus restore.
 *
 * The directive captures its Solid owner, so menu content rendered in the
 * portal keeps WheelContext and any scoped service providers from the
 * declaration site — menu components are ORDINARY connected components,
 * testable at every stub tier.
 *
 * A menu can also be DATA: `use:contextMenu={{ id, target: 'cell' }}` names
 * a `MenuService` target instead of passing JSX. The system resolves the
 * target's contributions into a `MenuLevel` when the menu opens and draws
 * it with the same keys either way: as FLYOUTS (submenus open beside their
 * row) or STACKED (a submenu replaces the panel, with a back control).
 * The `contextMenu.submenus` config (default `'auto'`) picks flyouts for a
 * fine pointer on a wide window, stacked levels otherwise.
 *
 * Keyboard users open the menu with Shift+F10 or the Menu key while the
 * trigger (or something inside it) has focus. The menu opens at the element,
 * not at the event's coordinates, which differ by browser, and its first
 * item takes focus. `ContextMenuService.openAt(id, element)` does the same
 * for apps that bind their own key.
 */
import {
  createEffect,
  createRenderEffect,
  getOwner,
  onCleanup,
  runWithOwner,
  useContext,
  type JSX,
  type Owner
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';

import { Show } from '../core/visibility';
import { Service } from '../core/services';
import { componentRoot, connect, viewRoot } from '../core/connect';
import { view } from '../core/view';
import { WheelContext } from '../core/context';
import { useSignal } from '../core/local-state';
import { WheelConfigService } from '../core/app-config';
import { z } from 'zod';
import { captureDeclSite } from '../core/decl-site';
import { FocusService } from './focus';
import { createMenuStack, type MenuAction, type MenuItem, type MenuLevel } from './menu-stack';
import { MenuStackPanel } from './menu-stack-panel';
import { MenuFlyout } from './menu-flyout';
import { MenuService } from './menus';

/** What every trigger site declares. */
interface ContextMenuBindingBase {
  /** Unique per trigger instance (e.g. `item:${id}`). */
  readonly id: string;
  /** `'pointer'` (default): open at the click point. `'element'`: attach to the trigger element (dropdown-style). */
  readonly anchor?: 'pointer' | 'element';
  /** The menu's accessible name ("Card menu"). Default: the target's label, or "Context menu". */
  readonly label?: string;
}

/** A menu whose content is JSX: any component, mounted only while open. */
export interface ContextMenuJsxBinding extends ContextMenuBindingBase {
  /** Lazy menu content — mounted only while this menu is open. */
  readonly menu: () => JSX.Element;
  readonly target?: never;
}

/** A menu built from data: a `MenuService` target's contributions. */
export interface ContextMenuDataBinding extends ContextMenuBindingBase {
  /** The `MenuService` target to resolve (`'cell'`, `'issue'`). */
  readonly target: string;
  /** What the menu opens on, passed to commands as `execute`'s `target`. */
  readonly subject?: () => unknown;
  /** Which instance this is, for runtime items (`contributeItems({ instance })`). */
  readonly instance?: string;
  readonly menu?: never;
}

/** What a trigger site declares: identity, content (JSX or a target), anchor mode. */
export type ContextMenuBinding = ContextMenuJsxBinding | ContextMenuDataBinding;

interface MenuRegistration {
  readonly id: string;
  readonly element: HTMLElement;
  /** JSX content. Absent for a data menu. */
  readonly render?: () => JSX.Element;
  /** Data content, resolved when the menu opens. Absent for a JSX menu. */
  readonly level?: () => MenuLevel;
  /** The menu's accessible name. */
  readonly label?: string;
  readonly anchor: 'pointer' | 'element';
  /** The declaration site's Solid owner — context flows into the portal through it. */
  readonly owner: Owner | null;
  readonly declaredAt?: string;
}

/**
 * A registration as the service stores it (declaredAt resolved). Exported
 * because `registration()` returns it, so any exported type that references
 * the system's connection (states files, stub helpers) must be able to name
 * it — a private name here fails declaration emit (TS4082).
 */
export interface StoredMenuRegistration extends MenuRegistration {
  readonly declaredAt: string;
}

/**
 * The `contextMenu` section of the Wheel app config.
 *
 *   export default defineWheelConfig({ contextMenu: { submenus: 'stacked' } });
 */
export const contextMenuConfigSchema = z.strictObject({
  /**
   * How data menus draw submenus. `'flyout'`: beside their row, on hover or
   * →. `'stacked'`: in place, with a back control. `'auto'` (default):
   * flyouts for a fine pointer on a window at least `flyoutMinWidth` wide,
   * stacked otherwise. A level with a size grid or a value field is always
   * stacked. JSX menus draw themselves and ignore this.
   */
  submenus: z.enum(['auto', 'flyout', 'stacked']).default('auto'),
  /** The narrowest window, in CSS pixels, where `'auto'` picks flyouts. Default 640. */
  flyoutMinWidth: z.number().int().nonnegative().default(640)
});

declare module '../core/index' {
  interface WheelAppConfig {
    /** Context menus. */
    readonly contextMenu?: z.input<typeof contextMenuConfigSchema>;
  }
}

/**
 * Global menu awareness: which menu is open and where. Single-open is
 * enforced by `open` being a scalar atom — opening one menu IS closing the
 * previous one.
 */
export class ContextMenuService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'ContextMenuService';

  /** State-tree group: wheel-internal plumbing, collapsed by default. */
  static override group = 'framework';

  private readonly registrations = new Map<string, StoredMenuRegistration>();
  /** The `contextMenu` config section. */
  readonly settings = this.service(WheelConfigService).section('contextMenu', contextMenuConfigSchema);

  private readonly current = this.atom<{ id: string; x: number; y: number; atElement: boolean } | null>(null, 'open');
  private readonly elements = this.field<ReadonlyMap<string, HTMLElement>>(new Map(), 'openAtElements');

  /** The open menu's id, or null. */
  readonly openId = this.computed(() => this.current.get()?.id ?? null, 'openId');
  /** The open menu's anchor point (pointer coordinates at open time). */
  readonly anchorPoint = this.computed(() => {
    const open = this.current.get();
    return open ? { x: open.x, y: open.y } : null;
  }, 'anchorPoint');
  /** Whether the open menu was opened at an element (keyboard) rather than a point. */
  readonly openedAtElement = this.computed(() => this.current.get()?.atElement === true, 'openedAtElement');

  /** Open a registered menu at a point. The one thing trigger machinery calls. */
  readonly open = this.action((id: string, point: { x: number; y: number }) => {
    this.current.set({ id, x: point.x, y: point.y, atElement: false });
  }, 'open');

  /**
   * Open a registered menu anchored to an element, first item focused —
   * what Shift+F10 and the Menu key do. The event's own coordinates are
   * ignored: browsers disagree about them for keyboard-opened menus. Pass
   * the element the menu is about (the active cell, a header, a tab); it
   * defaults to the trigger element.
   */
  readonly openAt = this.action((id: string, element?: HTMLElement) => {
    const anchor = element ?? this.registrations.get(id)?.element;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    this.elements.set(new Map([[id, anchor]]));
    this.current.set({ id, x: rect.left, y: rect.bottom, atElement: true });
  }, 'openAt');

  /** @internal The element an `openAt` menu is anchored to. */
  anchorElementOf(id: string): HTMLElement | undefined {
    return this.elements.get().get(id);
  }

  /**
   * @internal A one-shot timer on the service clock, for the system's hover
   * intent. Returns the cancel function.
   */
  schedule(ms: number, fn: () => void): () => void {
    return this.defer(ms, fn);
  }

  /** Close whatever is open (no-op when nothing is). */
  readonly close = this.action(() => this.current.set(null), 'close');

  /**
   * @internal Trigger sites register here; returns the unregister function.
   *
   * A same-id registration SUPERSEDES the previous one rather than throwing.
   * Reactive reparenting makes transient overlap normal: moving a keyed item
   * between two `<For>` lists mounts the new element (register) before the old
   * one is disposed (unregister), and the order is not guaranteed. The stale
   * registration's cleanup then no-ops via the identity guard below — the
   * same supersession semantics http.ts applies to same-id reconnects.
   */
  register(registration: MenuRegistration): () => void {
    const stored: StoredMenuRegistration = {
      ...registration,
      declaredAt:
        registration.declaredAt ??
        captureDeclSite(/\/kit\/context-menu\.(?:tsx?|jsx?)/)
    };
    this.registrations.set(stored.id, stored);
    return () => {
      if (this.registrations.get(stored.id) !== stored) return;
      this.registrations.delete(stored.id);
      if (this.current.get()?.id === stored.id) {
        this.close();
      }
    };
  }

  /** @internal The system host resolves the open menu's registration. */
  registration(id: string): StoredMenuRegistration | undefined {
    return this.registrations.get(id);
  }
}

/** Whether a keydown asks for the context menu: Shift+F10, or the Menu key. */
export function isContextMenuKey(event: KeyboardEvent): boolean {
  return (event.key === 'F10' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) || event.key === 'ContextMenu';
}

/**
 * The `use:contextMenu` directive — attach a menu to an existing element, no
 * wrapper, no ref plumbing:
 *
 *   <div use:contextMenu={{ id: `item:${props.id}`, menu: () => <ItemMenu id={props.id} /> }}>
 *   <div use:contextMenu={{ id: `cell:${id}`, target: 'cell', subject: () => ({ cellId: id }) }}>
 *
 * The first form mounts JSX; the second resolves a `MenuService` target.
 * Shift+F10 or the Menu key, pressed inside the element, opens the menu at
 * the focused element. Re-registers reactively if the binding changes (e.g.
 * id derived from props).
 */
export function contextMenu(el: HTMLElement, value: () => ContextMenuBinding): void {
  const context = useContext(WheelContext);
  if (!context) {
    throw new Error('use:contextMenu used outside a WheelProvider/ServiceProvider');
  }
  const service = context.services.get(ContextMenuService);
  const menus = context.services.get(MenuService);
  const owner = getOwner();
  // subscription boundary: registration + trigger listeners re-bind when the
  // binding value changes; onCleanup inside the effect tears down each pass.
  createRenderEffect(() => {
    const binding = value();
    const data = binding.target !== undefined ? binding : null;
    const unregister = service.register({
      id: binding.id,
      element: el,
      render: data ? undefined : binding.menu,
      level: data
        ? () => menus.levelFor(data.target, { subject: data.subject?.(), instance: data.instance })
        : undefined,
      label: binding.label ?? (data ? menus.labelOf(data.target) : undefined),
      anchor: binding.anchor ?? 'pointer',
      owner,
      declaredAt: captureDeclSite(/\/kit\/context-menu\.(?:tsx?|jsx?)/)
    });
    // The Menu key sends its own `contextmenu` event after the keydown, at
    // coordinates that differ by browser. The keydown already opened the
    // menu at the element, so that event is swallowed.
    let openedByKey = false;
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      if (openedByKey) {
        openedByKey = false;
        return;
      }
      service.open(binding.id, { x: event.clientX, y: event.clientY });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isContextMenuKey(event)) return;
      event.preventDefault();
      event.stopPropagation();
      openedByKey = event.key === 'ContextMenu';
      service.openAt(binding.id, event.target instanceof HTMLElement ? event.target : el);
    };
    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('keydown', onKeyDown);
    onCleanup(() => {
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('keydown', onKeyDown);
      unregister();
    });
  });
}

declare module 'solid-js' {
  namespace JSX {
    interface Directives {
      contextMenu: ContextMenuBinding;
    }
  }
}

/**
 * Component-form fallback (directives only work on native elements): wraps
 * the trigger surface in a plain div and binds it.
 */
export function ContextMenu(props: ContextMenuBinding & { children: JSX.Element }): JSX.Element {
  // The binding without `children`: the directive must not track the subtree.
  const binding = (): ContextMenuBinding =>
    props.target !== undefined
      ? { id: props.id, target: props.target, subject: props.subject, instance: props.instance, anchor: props.anchor, label: props.label }
      : { id: props.id, menu: props.menu, anchor: props.anchor, label: props.label };
  return (
    <div
      use:viewRoot={{ name: 'ContextMenu', group: 'framework', props }}
      style={{ display: 'contents' }}
      ref={(el) => contextMenu(el, binding)}
    >
      {props.children}
    </div>
  );
}

/** ContextMenuSystem's connection — exported for stubs and the states file. */
export const connectContextMenuSystem = connect('ContextMenuSystem', (c) => {
  const menuService = c.service(ContextMenuService);
  const focusService = c.service(FocusService);
  return view(
    {
      openId: menuService.openId,
      anchorPoint: menuService.anchorPoint,
      openedAtElement: menuService.openedAtElement,
      submenus: () => menuService.settings.submenus,
      flyoutMinWidth: () => menuService.settings.flyoutMinWidth
    },
    {
      close: menuService.close,
      registrationOf: (id: string) => menuService.registration(id),
      anchorElementOf: (id: string) => menuService.anchorElementOf(id),
      schedule: (ms: number, fn: () => void) => menuService.schedule(ms, fn),
      enterOverlay: focusService.enterOverlay,
      trapOverlayTab: focusService.trapOverlayTab
    }
  );
}, { group: 'framework' });

const MENU_ITEM_SELECTOR = [
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  'button:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function menuItems(panel: HTMLElement): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  return [...panel.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)].filter((element) => {
    if (seen.has(element) || element.closest('[hidden],[aria-hidden="true"]')) return false;
    seen.add(element);
    return true;
  });
}

function prepareMenuItems(panel: HTMLElement): HTMLElement[] {
  const items = menuItems(panel);
  for (const [index, item] of items.entries()) {
    if (!item.hasAttribute('role')) item.setAttribute('role', 'menuitem');
    item.tabIndex = index === 0 ? 0 : -1;
  }
  return items;
}

/** How a data menu draws its submenus. */
export type SubmenuStyle = 'auto' | 'flyout' | 'stacked';

/**
 * Props for `<ContextMenuSystem/>`: view customization only. App-wide
 * behavior (how submenus open) is the `contextMenu` config section.
 */
export interface ContextMenuSystemProps {
  /** Draw a data menu entry's icon key (`MenuAction.icon`) with your icon set. */
  readonly renderIcon?: (icon: string) => JSX.Element;
}

/** Resolve `'auto'` against the pointer and the window width. */
function resolveSubmenus(style: SubmenuStyle, flyoutMinWidth: number): 'flyout' | 'stacked' {
  if (style !== 'auto') return style;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'stacked';
  return window.matchMedia('(pointer: fine)').matches && window.innerWidth >= flyoutMinWidth ? 'flyout' : 'stacked';
}

/**
 * A copy of `level` whose actions close the menu BEFORE they run, so a
 * command that moves focus or opens a dialog lands after the menu's focus
 * restore, not before it. Toggles stay open and are left alone. Property
 * descriptors are copied, so live getters (a command's check) stay live.
 */
function closingFirst(level: MenuLevel, close: () => void): MenuLevel {
  const wrap = (item: MenuItem): MenuItem => {
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (item.submenu) {
      return Object.defineProperties({}, {
        ...descriptors,
        submenu: { value: closingFirst(item.submenu, close), enumerable: true }
      }) as MenuItem;
    }
    const action = item as MenuAction;
    if (action.checked !== undefined) return item;
    return Object.defineProperties({}, {
      ...descriptors,
      run: {
        value: () => {
          close();
          action.run();
        },
        enumerable: true
      }
    }) as MenuItem;
  };
  return { ...level, items: level.items.map(wrap) };
}

/** What `DataMenu` draws. */
interface DataMenuProps {
  readonly level: MenuLevel;
  readonly submenus: SubmenuStyle;
  readonly flyoutMinWidth: number;
  readonly close: () => void;
  readonly schedule: (ms: number, fn: () => void) => () => void;
  readonly renderIcon?: (icon: string) => JSX.Element;
}

/**
 * A data menu: one `MenuStack` over the resolved level, drawn as flyouts or
 * stacked levels. Keys go to the stack in both styles, so they behave the
 * same: ↑ ↓ move, → or Enter opens a submenu, ← or Esc closes one level
 * (Esc at the top closes the menu), Home and End jump. DOM focus follows the
 * highlighted entry.
 */
function DataMenu(props: DataMenuProps): JSX.Element {
  const [version, setVersion] = useSignal(0, 'version');
  const stack = createMenuStack(
    closingFirst(props.level, props.close),
    () => setVersion((value) => value + 1)
  );
  const state = () => {
    version();
    return stack.state();
  };
  let root: HTMLDivElement | undefined;
  // A size grid or a value field needs the whole panel: always stacked.
  const style = () => {
    const current = state();
    return current.grid || current.input ? 'stacked' : resolveSubmenus(props.submenus, props.flyoutMinWidth);
  };

  /** Pop one level and put the highlight back on the group that opened it. */
  const back = (): boolean => {
    const opener = state().trail.at(-1);
    if (!stack.pop()) return false;
    if (opener !== undefined) stack.highlight(opener);
    return true;
  };

  // focus boundary: DOM focus follows the highlighted entry of the deepest
  // open level, so a screen reader announces what the arrows reach.
  createEffect(() => {
    const current = state();
    void current.index;
    const levels = root?.querySelectorAll<HTMLElement>('[data-level]');
    const scope = levels && levels.length > 0 ? levels[levels.length - 1] : root;
    const active = scope?.querySelector<HTMLElement>('[data-active]');
    // Only while the menu holds focus — or just lost it because the focused
    // row left the DOM (a level was pushed or popped).
    const focused = document.activeElement;
    const menuHasFocus = !focused || focused === document.body || root?.contains(focused) === true;
    if (active && menuHasFocus) active.focus();
  });

  const onKeyDown = (event: KeyboardEvent) => {
    let handled = true;
    const current = state();
    if (event.key === 'Escape') {
      if (!back()) props.close();
    } else if (event.key === 'ArrowLeft') {
      handled = current.grid ? stack.handleKey('ArrowLeft') : back();
    } else if (event.key === 'Enter' || event.key === ' ') {
      if (stack.choose() === 'ran') props.close();
    } else if (event.key === 'Home') {
      stack.highlight(0);
    } else if (event.key === 'End') {
      stack.highlight(current.items.length - 1);
    } else {
      handled = stack.handleKey(event.key);
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <div
      use:viewRoot={{ name: 'DataMenu', group: 'framework', props }}
      ref={root}
      data-testid="wheel-data-menu"
      data-submenus={style()}
      onKeyDown={onKeyDown}
    >
      <Show
        when={style() === 'flyout'}
        fallback={<MenuStackPanel stack={stack} state={state} onRun={props.close} renderIcon={props.renderIcon} />}
      >
        <MenuFlyout
          stack={stack}
          state={state}
          onRun={props.close}
          schedule={props.schedule}
          renderIcon={props.renderIcon}
        />
      </Show>
    </div>
  );
}

/**
 * Mount once at the app root. Owns the portal, positioning, scrim, Escape,
 * and focus restore for whatever menu is open — JSX menus and data menus.
 */
export function ContextMenuSystem(props: ContextMenuSystemProps): JSX.Element {
  const state = connectContextMenuSystem(props);
  let panel: HTMLDivElement | undefined;

  // focus/listener boundary: the menu enters the shared overlay stack, its
  // first item receives focus, and pointer menus close on scroll.
  createEffect(() => {
    const openId = state.openId;
    if (!openId || !panel) return;
    const registration = state.registrationOf(openId);
    const items = prepareMenuItems(panel);
    const leaveOverlay = state.enterOverlay(panel, items[0]);
    const onScroll = () => {
      if (registration?.anchor !== 'element' && !state.openedAtElement) state.close();
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    onCleanup(() => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      leaveOverlay();
    });
  });

  // dom boundary: position the panel with floating-ui — flip/shift keep it
  // on screen; element anchors (and keyboard-opened menus) track scroll and
  // resize via autoUpdate.
  createEffect(() => {
    const openId = state.openId;
    const point = state.anchorPoint;
    if (!openId || !point || !panel) return;
    const registration = state.registrationOf(openId);
    if (!registration) return;
    const anchorElement =
      state.openedAtElement ? (state.anchorElementOf(openId) ?? registration.element) : registration.anchor === 'element' ? registration.element : null;
    const reference =
      anchorElement ??
      {
        getBoundingClientRect: () =>
          ({ x: point.x, y: point.y, top: point.y, left: point.x, bottom: point.y, right: point.x, width: 0, height: 0 }) as DOMRect
      };
    const target = panel;
    const position = () =>
      void computePosition(reference, target, {
        placement: anchorElement ? 'bottom-start' : 'right-start',
        // The panel is position:fixed; the default 'absolute' strategy bakes
        // page scroll into x/y, shifting every menu on a scrolled page.
        strategy: 'fixed',
        middleware: [offset(2), flip(), shift({ padding: 8 })]
      }).then(({ x, y }) => {
        target.style.left = `${x}px`;
        target.style.top = `${y}px`;
      });
    if (anchorElement) {
      const stop = autoUpdate(anchorElement, target, position);
      onCleanup(stop);
    } else {
      position();
    }
  });

  return (
    <Show when={state.openId} keyed>
      {(openId) => {
        const registration = state.registrationOf(openId);
        if (!registration) return null;
        const level = registration.level;
        return (
          <Portal>
            <div
              data-testid="wheel-menu-scrim"
              style={{ position: 'fixed', inset: '0', 'z-index': 10_000 }}
              onPointerDown={() => state.close()}
            />
            <div
              use:componentRoot
              ref={panel}
              role="menu"
              aria-label={registration.label ?? 'Context menu'}
              data-testid="wheel-context-menu"
              style={{ position: 'fixed', top: '0', left: '0', 'z-index': 10_001 }}
              onClick={(event) => {
                // A data menu closes through its stack (a group click must
                // push, not close). Only JSX menus close on item clicks.
                if (level) return;
                // Choosing an item closes the menu — after the item's own
                // handler has run (bubbling order). Without this, the menu and
                // its scrim (z 10000+) outlive the click and swallow the next
                // pointer event — e.g. the first click on a confirm dialog
                // (z 9000) an item handler just opened. Checkbox/radio items
                // are exempt: a checklist toggles in place and stays open.
                const item =
                  event.target instanceof HTMLElement
                    ? event.target.closest(MENU_ITEM_SELECTOR)
                    : null;
                if (
                  item instanceof HTMLElement &&
                  !item.matches('[role="menuitemcheckbox"],[role="menuitemradio"]')
                ) {
                  state.close();
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  state.close();
                  return;
                }
                if (state.trapOverlayTab(event.currentTarget, event)) {
                  event.stopPropagation();
                  return;
                }
                // A data menu's keys went to its stack already.
                if (level) return;
                const items = menuItems(event.currentTarget);
                const activeIndex =
                  document.activeElement instanceof HTMLElement
                    ? items.indexOf(document.activeElement)
                    : -1;
                let nextIndex: number | null = null;
                if (event.key === 'ArrowDown') {
                  nextIndex = activeIndex < 0 || activeIndex === items.length - 1 ? 0 : activeIndex + 1;
                } else if (event.key === 'ArrowUp') {
                  nextIndex = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
                } else if (event.key === 'Home') {
                  nextIndex = 0;
                } else if (event.key === 'End') {
                  nextIndex = items.length - 1;
                } else if (
                  (event.key === 'Enter' || event.key === ' ') &&
                  activeIndex >= 0
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  items[activeIndex].click();
                  return;
                }
                if (nextIndex !== null && items[nextIndex]) {
                  event.preventDefault();
                  event.stopPropagation();
                  for (const item of items) item.tabIndex = -1;
                  items[nextIndex].tabIndex = 0;
                  items[nextIndex].focus();
                }
              }}
            >
              {level ? (
                <DataMenu
                  level={level()}
                  submenus={state.submenus}
                  flyoutMinWidth={state.flyoutMinWidth}
                  close={state.close}
                  schedule={state.schedule}
                  renderIcon={props.renderIcon}
                />
              ) : (
                runWithOwner(registration.owner, () => registration.render?.())
              )}
            </div>
          </Portal>
        );
      }}
    </Show>
  );
}
