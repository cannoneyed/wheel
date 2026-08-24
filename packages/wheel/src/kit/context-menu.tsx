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
import { captureDeclSite } from '../core/decl-site';
import { FocusService } from './focus';

/** What a trigger site declares: identity, lazy content, anchor mode. */
export interface ContextMenuBinding {
  /** Unique per trigger instance (e.g. `item:${id}`). */
  readonly id: string;
  /** Lazy menu content — mounted only while this menu is open. */
  readonly menu: () => JSX.Element;
  /** `'pointer'` (default): open at the click point. `'element'`: attach to the trigger element (dropdown-style). */
  readonly anchor?: 'pointer' | 'element';
}

interface MenuRegistration {
  readonly id: string;
  readonly element: HTMLElement;
  readonly render: () => JSX.Element;
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
 * Global menu awareness: which menu is open and where. Single-open is
 * enforced by `open` being a scalar atom — opening one menu IS closing the
 * previous one.
 */
export class ContextMenuService extends Service {
  /** State-tree group: wheel-internal plumbing, collapsed by default. */
  static override group = 'framework';

  private readonly registrations = new Map<string, StoredMenuRegistration>();
  private readonly current = this.atom<{ id: string; x: number; y: number } | null>(null, 'open');

  /** The open menu's id, or null. */
  readonly openId = this.computed(() => this.current.get()?.id ?? null, 'openId');
  /** The open menu's anchor point (pointer coordinates at open time). */
  readonly anchorPoint = this.computed(() => {
    const open = this.current.get();
    return open ? { x: open.x, y: open.y } : null;
  }, 'anchorPoint');

  /** Open a registered menu at a point. The one thing trigger machinery calls. */
  readonly open = this.action((id: string, point: { x: number; y: number }) => {
    this.current.set({ id, x: point.x, y: point.y });
  }, 'open');

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

/**
 * The `use:contextMenu` directive — attach a menu to an existing element, no
 * wrapper, no ref plumbing:
 *
 *   <div use:contextMenu={{ id: `item:${props.id}`, menu: () => <ItemMenu id={props.id} /> }}>
 *
 * Re-registers reactively if the binding changes (e.g. id derived from props).
 */
export function contextMenu(el: HTMLElement, value: () => ContextMenuBinding): void {
  const context = useContext(WheelContext);
  if (!context) {
    throw new Error('use:contextMenu used outside a WheelProvider/ServiceProvider');
  }
  const service = context.services.get(ContextMenuService);
  const owner = getOwner();
  // subscription boundary: registration + trigger listener re-bind when the
  // binding value changes; onCleanup inside the effect tears down each pass.
  createRenderEffect(() => {
    const binding = value();
    const unregister = service.register({
      id: binding.id,
      element: el,
      render: binding.menu,
      anchor: binding.anchor ?? 'pointer',
      owner,
      declaredAt: captureDeclSite(/\/kit\/context-menu\.(?:tsx?|jsx?)/)
    });
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      service.open(binding.id, { x: event.clientX, y: event.clientY });
    };
    el.addEventListener('contextmenu', onContextMenu);
    onCleanup(() => {
      el.removeEventListener('contextmenu', onContextMenu);
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
  return (
    <div
      use:viewRoot={{ name: 'ContextMenu', group: 'framework', props }}
      style={{ display: 'contents' }}
      ref={(el) => contextMenu(el, () => ({ id: props.id, menu: props.menu, anchor: props.anchor }))}
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
      anchorPoint: menuService.anchorPoint
    },
    {
      close: menuService.close,
      registrationOf: (id: string) => menuService.registration(id),
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

/**
 * Mount once at the app root. Owns the portal, positioning, scrim, Escape,
 * and focus restore for whatever menu is open.
 */
export function ContextMenuSystem(): JSX.Element {
  const state = connectContextMenuSystem({});
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
      if (registration?.anchor !== 'element') state.close();
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    onCleanup(() => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      leaveOverlay();
    });
  });

  // dom boundary: position the panel with floating-ui — flip/shift keep it
  // on screen; element anchors track scroll/resize via autoUpdate.
  createEffect(() => {
    const openId = state.openId;
    const point = state.anchorPoint;
    if (!openId || !point || !panel) return;
    const registration = state.registrationOf(openId);
    if (!registration) return;
    const reference =
      registration.anchor === 'element'
        ? registration.element
        : {
            getBoundingClientRect: () =>
              ({ x: point.x, y: point.y, top: point.y, left: point.x, bottom: point.y, right: point.x, width: 0, height: 0 }) as DOMRect
          };
    const target = panel;
    const position = () =>
      void computePosition(reference, target, {
        placement: registration.anchor === 'element' ? 'bottom-start' : 'right-start',
        // The panel is position:fixed; the default 'absolute' strategy bakes
        // page scroll into x/y, shifting every menu on a scrolled page.
        strategy: 'fixed',
        middleware: [offset(2), flip(), shift({ padding: 8 })]
      }).then(({ x, y }) => {
        target.style.left = `${x}px`;
        target.style.top = `${y}px`;
      });
    if (registration.anchor === 'element') {
      const stop = autoUpdate(registration.element, target, position);
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
              aria-label="Context menu"
              data-testid="wheel-context-menu"
              style={{ position: 'fixed', top: '0', left: '0', 'z-index': 10_001 }}
              onClick={(event) => {
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
                const items = menuItems(event.currentTarget);
                const activeIndex =
                  document.activeElement instanceof HTMLElement
                    ? items.indexOf(document.activeElement)
                    : -1;
                let nextIndex: number | null = null;
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  state.close();
                  return;
                }
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
                } else if (state.trapOverlayTab(event.currentTarget, event)) {
                  event.stopPropagation();
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
              {runWithOwner(registration.owner, () => registration.render())}
            </div>
          </Portal>
        );
      }}
    </Show>
  );
}
