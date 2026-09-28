/**
 * Menus from data: targets, slots, and contributions.
 *
 * A context menu used to be one JSX component that every feature edited.
 * Here a menu is DATA. The app names a TARGET — the kind of thing a menu
 * opens on (`'cell'`, `'issue'`, `'session'`) — and the SLOTS it holds, in
 * order. Each feature CONTRIBUTES entries to a slot: a command id, a named
 * submenu, or a separator. Features never edit one shared menu, and the
 * menu can be listed, searched, and tested without a DOM.
 *
 * `levelFor(target)` turns the contributions into the `MenuLevel` data that
 * `MenuStack` already draws. A command entry takes its title, shortcut,
 * check, and disabled reason from `CommandService`, and runs through
 * `execute` with `source: 'menu'`. A hidden command draws nothing. Slots
 * with nothing in them draw nothing, and dividers never double up or sit
 * at the top or bottom.
 *
 * Some entries only exist while the app runs — a sandboxed widget that
 * sends its own items by message. `contributeItems` adds those for one
 * target, or for one INSTANCE of it (only this cell's menu), labelled with
 * where they came from.
 */
import { Service } from '../core/services';
import { captureDeclSite } from '../core/decl-site';
import { isWheelDevMode } from '../core/dev-mode';
import { logger } from '../core/logger';
import { CommandService, type CommandContext } from './commands';
import type { MenuAction, MenuItem, MenuLevel } from './menu-stack';

/** One contributed entry. */
export type MenuEntry =
  /** A registry command: title, keys, check, and reason come from it. */
  | { readonly command: string; readonly args?: unknown; readonly label?: string }
  /** A nested menu: another target, drawn as a submenu. */
  | { readonly submenu: string; readonly label: string; readonly icon?: string }
  /** A divider. Dividers between slots are automatic; this one splits a slot. */
  | { readonly separator: true };

/** A feature's entry in one target's slot. */
export interface MenuContribution {
  /** The target the entry belongs to: `'cell'`, `'issue'`. */
  readonly target: string;
  /** The slot inside it: `'clipboard'`. Slots are drawn between dividers. */
  readonly slot: string;
  readonly entry: MenuEntry;
  /** Lower first. Ties keep contribution order. Default 0. */
  readonly order?: number;
  /** Only while this holds. The command's own `visible` applies as well. */
  readonly when?: (ctx: CommandContext) => boolean;
}

/** Items that exist only while the app runs (a widget's own actions). */
export interface RuntimeMenuItems {
  readonly target: string;
  /** Only the menu opened on this instance (`cellId`). Omit for every instance. */
  readonly instance?: string;
  readonly slot: string;
  /** Who added them, drawn next to each item: `'Image selector'`. */
  readonly source: string;
  /**
   * The items. A disabled item must say why: one without a
   * `disabledReason` is dropped, and dev mode logs it.
   */
  readonly items: readonly MenuAction[];
}

/** What a menu is being built for. */
export interface MenuRequest {
  /** What the menu was opened on; passed to commands as `execute`'s `target`. */
  readonly subject?: unknown;
  /** Which instance of the target, for runtime items. */
  readonly instance?: string;
}

interface TargetDefinition {
  readonly slots: readonly string[];
  readonly label?: string;
  readonly declaredAt: string;
}

interface StoredContribution {
  readonly contribution: MenuContribution;
  readonly sequence: number;
}

interface StoredRuntimeItems {
  readonly runtime: RuntimeMenuItems;
  readonly sequence: number;
}

/**
 * A copy of `item` with extra fields. Copies property DESCRIPTORS, not
 * values: a command entry's label, check, and reason are getters over live
 * state, and a spread would freeze them at the moment the menu was built.
 */
function withFields<T extends MenuItem>(item: T, fields: Partial<MenuAction>): T {
  const extra: PropertyDescriptorMap = {};
  for (const [key, value] of Object.entries(fields)) {
    extra[key] = { value, enumerable: true, configurable: true };
  }
  return Object.defineProperties({}, { ...Object.getOwnPropertyDescriptors(item), ...extra }) as T;
}

/** Owns menu targets and their contributions. See the module doc. */
export class MenuService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'MenuService';

  /** State-tree group: wheel-internal plumbing, collapsed by default. */
  static override group = 'framework';

  private readonly commandService = this.service(CommandService);
  private readonly targets = this.atom<Readonly<Record<string, TargetDefinition>>>({}, 'targets');
  private readonly contributions = this.atom<readonly StoredContribution[]>([], 'contributions');
  private readonly runtimeItems = this.atom<readonly StoredRuntimeItems[]>([], 'runtimeItems');
  private readonly sequence = this.field(0, 'sequence');

  /**
   * Name a target and fix the order of its slots. `label` names the menu
   * for screen readers ("Cell menu"). Returns the undefine function. A
   * target used without a definition draws its slots in first-contribution
   * order.
   */
  defineTarget(target: string, slots: readonly string[], options: { readonly label?: string } = {}): () => void {
    const declaredAt = captureDeclSite(/\/kit\/menus\.(?:tsx?|jsx?)/);
    const existing = this.targets.get()[target];
    if (existing) {
      throw new Error(
        `Duplicate menu target '${target}'. First defined at ${existing.declaredAt}; duplicate defined at ${declaredAt}.`
      );
    }
    const definition: TargetDefinition = { slots: [...slots], label: options.label, declaredAt };
    this.targets.set({ ...this.targets.get(), [target]: definition });
    return () => {
      if (this.targets.get()[target] !== definition) return;
      const { [target]: _removed, ...rest } = this.targets.get();
      this.targets.set(rest);
    };
  }

  /** Add one entry to a target's slot. Returns the remove function. */
  contribute(contribution: MenuContribution): () => void {
    const stored: StoredContribution = { contribution, sequence: this.nextSequence() };
    this.contributions.set([...this.contributions.get(), stored]);
    return () => this.contributions.set(this.contributions.get().filter((entry) => entry !== stored));
  }

  /** Add items that exist only at runtime. Returns the remove function. */
  contributeItems(runtime: RuntimeMenuItems): () => void {
    const stored: StoredRuntimeItems = { runtime, sequence: this.nextSequence() };
    this.runtimeItems.set([...this.runtimeItems.get(), stored]);
    return () => this.runtimeItems.set(this.runtimeItems.get().filter((entry) => entry !== stored));
  }

  /** The target's screen-reader label, if it was defined with one. */
  labelOf(target: string): string | undefined {
    return this.targets.get()[target]?.label;
  }

  /**
   * Resolve a target into the level `MenuStack` draws: slots in order,
   * entries by `order`, commands described by the registry, empty slots
   * and hidden commands dropped, one divider between non-empty slots.
   */
  levelFor(target: string, request: MenuRequest = {}): MenuLevel {
    return this.buildLevel(target, request, new Set());
  }

  private nextSequence(): number {
    const next = this.sequence.get() + 1;
    this.sequence.set(next);
    return next;
  }

  private buildLevel(target: string, request: MenuRequest, open: ReadonlySet<string>): MenuLevel {
    if (open.has(target)) {
      throw new Error(`Menu target '${target}' contains itself through a submenu.`);
    }
    const nested = new Set([...open, target]);
    const ctx = this.commandService.contextFor({ source: 'menu', target: request.subject });
    const definition = this.targets.get()[target];
    const contributions = this.contributions.get().filter((entry) => entry.contribution.target === target);
    const runtime = this.runtimeItems
      .get()
      .filter(
        (entry) =>
          entry.runtime.target === target &&
          (entry.runtime.instance === undefined || entry.runtime.instance === request.instance)
      );

    const slots = [...(definition?.slots ?? [])];
    for (const slot of [
      ...contributions.map((entry) => entry.contribution.slot),
      ...runtime.map((entry) => entry.runtime.slot)
    ]) {
      if (!slots.includes(slot)) slots.push(slot);
    }

    const items: MenuItem[] = [];
    for (const slot of slots) {
      const section = this.buildSlot(slot, contributions, runtime, ctx, request, nested);
      if (section.length === 0) continue;
      // One divider between non-empty slots, never above the first.
      if (items.length > 0) section[0] = withFields(section[0], { separatorBefore: true });
      items.push(...section);
    }
    return { title: definition?.label ?? '', items };
  }

  private buildSlot(
    slot: string,
    contributions: readonly StoredContribution[],
    runtime: readonly StoredRuntimeItems[],
    ctx: CommandContext,
    request: MenuRequest,
    open: ReadonlySet<string>
  ): MenuItem[] {
    const entries = contributions
      .filter((entry) => entry.contribution.slot === slot)
      .sort((a, b) => (a.contribution.order ?? 0) - (b.contribution.order ?? 0) || a.sequence - b.sequence);
    const section: MenuItem[] = [];
    let dividerPending = false;
    const add = (item: MenuItem) => {
      // A divider only draws between two entries that both drew.
      section.push(dividerPending && section.length > 0 ? withFields(item, { separatorBefore: true }) : item);
      dividerPending = false;
    };
    for (const { contribution } of entries) {
      if (contribution.when && !contribution.when(ctx)) continue;
      const entry = contribution.entry;
      if ('separator' in entry) {
        dividerPending = true;
      } else if ('command' in entry) {
        const item = this.commandService.menuItem(entry.command, {
          args: entry.args,
          target: request.subject,
          label: entry.label
        });
        if (item) add(item);
      } else {
        const level = this.buildLevel(entry.submenu, request, open);
        if (level.items.length > 0) {
          add({ id: `submenu:${entry.submenu}`, label: entry.label, icon: entry.icon, submenu: { ...level, title: entry.label } });
        }
      }
    }
    for (const { runtime: contributed } of runtime.filter((entry) => entry.runtime.slot === slot)) {
      for (const item of contributed.items) {
        if (item.disabled === true && !item.disabledReason) {
          if (isWheelDevMode()) {
            logger.warn(`Menu item '${item.id}' from '${contributed.source}' is disabled without a reason; it was dropped.`);
          }
          continue;
        }
        add(withFields(item, { source: contributed.source }));
      }
    }
    return section;
  }
}
