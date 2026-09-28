/**
 * The command registry: one record per named action.
 *
 * A command ("Insert row above", "Archive issue") carries its title, its
 * keys, the rule for when it applies, the rule for when it can run, and the
 * one function that runs it. Keys, the command palette, menus, toolbars,
 * and agents all read the same record and run it through the same
 * `execute(id, args, { source })` call. Nothing calls a command's `run`
 * directly.
 *
 * Two rules, kept apart on purpose:
 *
 * - `visible(ctx)` — does this command make sense here at all? A hidden
 *   command is not listed, and its key falls through to the next binding.
 * - `enabled(ctx)` — can it run right now? It returns `true` or
 *   `{ reason }`. There is no bare `false`: a dim entry that cannot say why
 *   teaches nothing. A disabled command is listed, drawn dim with its
 *   reason, and blocked. Its key is consumed and the reason is shown.
 *
 * Wheel does not know about an app's selection or cells. The app supplies
 * its own context with `setContext`, and every rule reads it. Wheel adds
 * the focus path, the source, and the menu target or agent actor.
 *
 * Everything here is headless: listing, search, the rules, and `execute`
 * all work without a DOM.
 */
import type { JSX } from 'solid-js';

import { Service } from '../core/services';
import { captureDeclSite } from '../core/decl-site';
import { isWheelDevMode } from '../core/dev-mode';
import { logger } from '../core/logger';
import { FocusService } from './focus';
import { KeyboardService } from './keyboard';
import { detectPlatform, formatCombo, type KeyPlatform } from './key-combo';
import { WheelConfigService } from '../core/app-config';
import { z } from 'zod';
import type { MenuAction } from './menu-stack';
import { ToastService } from './toast';

/** Where an `execute` call came from. */
export type CommandSource = 'key' | 'palette' | 'menu' | 'toolbar' | 'api' | 'agent';

/** Who is asking, and about what. The app's context reader receives it. */
export interface CommandRequest {
  /** Where the call came from. */
  readonly source: CommandSource;
  /** What a menu was opened on (a row, a cell). */
  readonly target?: unknown;
  /** For agents: build the context as this identity. */
  readonly actor?: unknown;
}

/**
 * The context every rule and `run` receives. Apps extend it with their own
 * fields (`interface SheetCtx extends CommandContext { selection: … }`) and
 * supply those fields with `CommandService.setContext`.
 */
export interface CommandContext extends CommandRequest {
  /** The focus scopes the user is working in (frozen while an overlay is open). */
  readonly focus: {
    /** Innermost first — `FocusService.workingScopePath()`. */
    readonly path: readonly string[];
    /** The innermost scope, or null. */
    readonly scope: string | null;
  };
}

/** `enabled`'s answer: runnable, or blocked with the reason a person reads. */
export type CommandEnabled = true | { readonly reason: string };

/** One key that runs a command. Plain data, so a later remap is a lookup by id. */
export interface KeySpec<Ctx extends CommandContext = CommandContext> {
  /** A combo, like `'mod+shift+z'` (see `parseCombo`). */
  readonly key: string;
  /** Only on this platform. Omit for every platform. */
  readonly platform?: KeyPlatform;
  /** Only while this focus scope is on the path. Omit for a global key. */
  readonly scope?: string;
  /** Extra rule for this key only. The command's `visible` always applies. */
  readonly when?: (ctx: Ctx) => boolean;
  /** Fire from editable targets. See `KeyBinding.inInputs`. */
  readonly inInputs?: boolean;
  /** Fire while an overlay owns focus. See `KeyBinding.inOverlays`. */
  readonly inOverlays?: boolean;
  /** `false`: the key works but is not shown next to the title (an alias). */
  readonly display?: false;
}

/** A number argument. */
export interface NumberArgField {
  readonly kind: 'number';
  readonly label: string;
  readonly min?: number;
  readonly max?: number;
  /** The command runs without it. */
  readonly optional?: boolean;
  /** A default from the context, used when the caller passes none. */
  readonly initial?: (ctx: CommandContext) => number | undefined;
}

/** A text argument. */
export interface TextArgField {
  readonly kind: 'text';
  readonly label: string;
  readonly optional?: boolean;
  readonly initial?: (ctx: CommandContext) => string | undefined;
}

/** One value out of a list. */
export interface ChoiceArgField<T> {
  readonly kind: 'choice';
  readonly label: string;
  readonly options: (ctx: CommandContext) => readonly { readonly value: T; readonly label: string }[];
  readonly optional?: boolean;
  readonly initial?: (ctx: CommandContext) => T | undefined;
}

/** The field that describes one argument of type `T`. */
export type ArgField<T> = [T] extends [number]
  ? NumberArgField
  : [T] extends [string]
    ? TextArgField | ChoiceArgField<T>
    : ChoiceArgField<T>;

/** Any argument field, whatever its value type. */
export type AnyArgField = NumberArgField | TextArgField | ChoiceArgField<unknown>;

/** The arguments a command takes, one field per key. */
export type ArgSpec<Args> = { readonly [K in keyof Args]-?: ArgField<NonNullable<Args[K]>> };

/** One named action. `Ctx` is the app's context type; `Args` its arguments. */
export interface CommandSpec<Ctx extends CommandContext = CommandContext, Args = void> {
  /** Stable id, `area.verbObject`: `'row.insertAbove'`. Never reused. */
  readonly id: string;
  /** Plain, or computed from the context: `'Insert 3 rows above'`. */
  readonly title: string | ((ctx: Ctx) => string);
  /** The heading in the palette and help screen: `'Rows'`, `'Go to'`. */
  readonly group?: string;
  /** Extra search words. */
  readonly keywords?: readonly string[];
  /** One line under the title. */
  readonly subtitle?: string | ((ctx: Ctx) => string);
  /** A leading glyph. */
  readonly icon?: () => JSX.Element;
  /** Keys that run it. The first displayed one is shown next to the title. */
  readonly keys?: readonly (string | KeySpec<Ctx>)[];
  /** Does this make sense here? False: not listed, and its key falls through. */
  readonly visible?: (ctx: Ctx) => boolean;
  /** Can it run now? When it cannot, the reason is required. */
  readonly enabled?: (ctx: Ctx) => CommandEnabled;
  /** Toggle state, for checkable commands. */
  readonly checked?: (ctx: Ctx) => boolean | 'mixed';
  /** The arguments it takes. Agents and the API must pass required ones. */
  readonly args?: ArgSpec<Args>;
  /** Listed in the palette. Default true. Key-only moves (arrows) set false. */
  readonly palette?: boolean;
  /** Agents may call it. Default true. */
  readonly agent?: boolean;
  /** Does the work. Only `execute` calls it. */
  readonly run: (ctx: Ctx, args: Args) => void | Promise<void>;
}

/** What a surface draws for one visible command. */
export interface CommandState {
  readonly id: string;
  readonly title: string;
  readonly group?: string;
  readonly subtitle?: string;
  readonly icon?: () => JSX.Element;
  readonly keywords?: readonly string[];
  /** The first displayed key, formatted for this platform (`⇧⌘Z`). */
  readonly shortcut?: string;
  /** Every displayed key, as written. */
  readonly keys?: readonly string[];
  readonly checked?: boolean | 'mixed';
  /** Present means disabled; the text says why. */
  readonly disabledReason?: string;
}

/** Options for `execute`. */
export interface ExecuteOptions {
  /** Default `'api'`. */
  readonly source?: CommandSource;
  /** What a menu was opened on; passed to the context reader. */
  readonly target?: unknown;
  /** For agents: build the context as this identity. */
  readonly actor?: unknown;
}

/** What `execute` reports. `run` was called only when `ok` is true. */
export type ExecuteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly why: 'unknown' | 'hidden' | 'cancelled' }
  | { readonly ok: false; readonly why: 'disabled'; readonly reason: string }
  | { readonly ok: false; readonly why: 'failed'; readonly message: string };

/** What `onExecute` hooks receive after every `execute`. */
export interface ExecuteEvent {
  readonly id: string;
  readonly args: unknown;
  readonly source: CommandSource;
  readonly target?: unknown;
  readonly actor?: unknown;
  readonly result: ExecuteResult;
  /** Service-clock time spent in `run`. Zero when `run` was not called. */
  readonly durationMs: number;
}

/**
 * Asks a person for arguments the caller did not pass (a small dialog, or
 * the palette's argument step). Resolve null to cancel.
 */
export type ArgsPrompt = (request: {
  readonly command: CommandState;
  readonly fields: Readonly<Record<string, AnyArgField>>;
  /** The names still missing. */
  readonly missing: readonly string[];
  /** What is already known (passed, or from `initial`). */
  readonly values: Readonly<Record<string, unknown>>;
  readonly ctx: CommandContext;
}) => Promise<Readonly<Record<string, unknown>> | null>;

// The registry stores every command with its types erased; `register` is
// where each one is checked against its own `Ctx` and `Args`.
type StoredSpec = CommandSpec<any, any>;

interface RegisteredCommand {
  readonly spec: StoredSpec;
  readonly declaredAt: string;
}

/**
 * The `commands` section of the Wheel app config.
 *
 *   export default defineWheelConfig({ commands: { blockedKeyFeedback: 'none' } });
 */
export const commandsConfigSchema = z.strictObject({
  /**
   * What a person sees when a key runs a disabled command: `'toast'`
   * (default) flashes the reason; `'none'` shows nothing (the app reads
   * the result from an `onExecute` hook instead). The key is consumed
   * either way.
   */
  blockedKeyFeedback: z.enum(['toast', 'none']).default('toast')
});

declare module '../core/index' {
  interface WheelAppConfig {
    /** The command registry. */
    readonly commands?: z.input<typeof commandsConfigSchema>;
  }
}

/** Sources that cannot ask a person for missing arguments. */
const HEADLESS_SOURCES: ReadonlySet<CommandSource> = new Set<CommandSource>(['api', 'agent']);

function keySpecs(spec: StoredSpec): readonly KeySpec[] {
  return (spec.keys ?? []).map((key) => (typeof key === 'string' ? { key } : key));
}

/** Keys that apply on `platform`, in declaration order. */
function platformKeys(spec: StoredSpec, platform: KeyPlatform): readonly KeySpec[] {
  return keySpecs(spec).filter((key) => key.platform === undefined || key.platform === platform);
}

/**
 * Normalize an `enabled` answer. A bare `false` is a type error, but plain
 * JavaScript callers can still return it — it blocks with a generic reason,
 * and dev mode says which command broke the rule.
 */
function enabledState(spec: StoredSpec, ctx: CommandContext): string | undefined {
  const answer = spec.enabled?.(ctx) ?? true;
  if (answer === true) return undefined;
  if (answer && typeof answer === 'object' && typeof answer.reason === 'string' && answer.reason) {
    return answer.reason;
  }
  if (isWheelDevMode()) {
    logger.warn(`Command '${spec.id}' is disabled without a reason. Return { reason } from enabled().`);
  }
  return 'Not available right now';
}

/** Check one argument value against its field. Returns an error or null. */
function argError(name: string, field: AnyArgField, value: unknown, ctx: CommandContext): string | null {
  if (field.kind === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value)) return `Argument '${name}' (${field.label}) must be a number`;
    if (field.min !== undefined && value < field.min) return `Argument '${name}' (${field.label}) must be at least ${field.min}`;
    if (field.max !== undefined && value > field.max) return `Argument '${name}' (${field.label}) must be at most ${field.max}`;
    return null;
  }
  if (field.kind === 'text') {
    return typeof value === 'string' ? null : `Argument '${name}' (${field.label}) must be text`;
  }
  const options = field.options(ctx);
  return options.some((option) => Object.is(option.value, value))
    ? null
    : `Argument '${name}' (${field.label}) must be one of: ${options.map((option) => option.label).join(', ')}`;
}

/**
 * Owns the command table and the one run path. See the module doc.
 */
export class CommandService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'CommandService';

  /** State-tree group: wheel-internal plumbing, collapsed by default. */
  static override group = 'framework';

  private readonly focusService = this.service(FocusService);
  private readonly keyboardService = this.service(KeyboardService);
  private readonly toastService = this.service(ToastService);
  private readonly settings = this.service(WheelConfigService).section('commands', commandsConfigSchema);
  private readonly registered = this.atom<readonly RegisteredCommand[]>([], 'registered');
  private readonly contextReader = this.field<((request: CommandRequest) => object) | null>(null, 'contextReader');
  private readonly argsPrompt = this.field<ArgsPrompt | null>(null, 'argsPrompt');
  private readonly hooks = this.field<readonly ((event: ExecuteEvent) => void)[]>([], 'hooks');

  /**
   * Register a command; returns the unregister function. Services register
   * in their constructors and pair it with `addCleanup`. Throws on a
   * duplicate id, naming both declaration sites. Each of the command's keys
   * becomes a `KeyboardService` binding that runs
   * `execute(id, undefined, { source: 'key' })`.
   */
  register<Ctx extends CommandContext = CommandContext, Args = void>(spec: CommandSpec<Ctx, Args>): () => void {
    const declaredAt = captureDeclSite(/\/kit\/(?:commands|command-palette)\.(?:tsx?|jsx?)/);
    const existing = this.registered.get().find((entry) => entry.spec.id === spec.id);
    if (existing) {
      throw new Error(
        `Duplicate command id '${spec.id}'. First registered at ${existing.declaredAt}; duplicate registered at ${declaredAt}.`
      );
    }
    const entry: RegisteredCommand = { spec: spec as StoredSpec, declaredAt };
    const unbind = this.bindKeys(entry.spec);
    this.registered.set([...this.registered.get(), entry]);
    return () => {
      unbind();
      this.registered.set(this.registered.get().filter((candidate) => candidate !== entry));
    };
  }

  /**
   * Supply the app's context. `read` runs for every rule check and every
   * `execute`, with the request (source, menu target, agent actor), and its
   * fields are merged under Wheel's own (`focus`, `source`, `target`,
   * `actor`). Read reactive state inside it, so lists update when it
   * changes. Returns a function that removes it.
   */
  setContext<Ctx extends object>(read: (request: CommandRequest) => Ctx): () => void {
    this.contextReader.set(read);
    return () => {
      if (this.contextReader.get() === read) this.contextReader.set(null);
    };
  }

  /**
   * Supply the UI that asks a person for missing arguments. Without one, a
   * command with a missing required argument fails with a message naming
   * the field. Returns a function that removes it.
   */
  setArgsPrompt(prompt: ArgsPrompt): () => void {
    this.argsPrompt.set(prompt);
    return () => {
      if (this.argsPrompt.get() === prompt) this.argsPrompt.set(null);
    };
  }

  /**
   * Called after every `execute`, with its source, actor, result, and time.
   * Apps use it to group undo steps and send telemetry. Returns the
   * unsubscribe function.
   */
  onExecute(hook: (event: ExecuteEvent) => void): () => void {
    this.hooks.set([...this.hooks.get(), hook]);
    return () => this.hooks.set(this.hooks.get().filter((candidate) => candidate !== hook));
  }

  /** Build the context the rules see for one request. */
  contextFor(request: CommandRequest): CommandContext {
    const path = this.focusService.workingScopePath();
    const app = this.contextReader.get()?.(request) ?? {};
    return {
      ...app,
      focus: { path, scope: path[0] ?? null },
      source: request.source,
      target: request.target,
      actor: request.actor
    };
  }

  /** Every registered command, ungated — for help screens and tool lists. */
  readonly all = this.computed(
    (): readonly CommandSpec[] => this.registered.get().map((entry) => entry.spec as CommandSpec),
    'all'
  );

  /**
   * The visible commands and their state for one request, in registration
   * order. An `agent` request leaves out commands with `agent: false`, so
   * an agent's tool list and a person's list follow one rule.
   */
  listFor(request: CommandRequest): readonly CommandState[] {
    const ctx = this.contextFor(request);
    const platform = detectPlatform();
    const states: CommandState[] = [];
    for (const { spec } of this.registered.get()) {
      if (request.source === 'agent' && spec.agent === false) continue;
      if (spec.visible && !spec.visible(ctx)) continue;
      states.push(this.describe(spec, ctx, platform));
    }
    return states;
  }

  /** Visible commands in the palette's context, registration order. */
  readonly list = this.computed(() => this.listFor({ source: 'palette' }), 'list');

  /** One command's state for a request, or null when unknown or hidden. */
  stateOf(id: string, request: CommandRequest = { source: 'api' }): CommandState | null {
    const entry = this.registered.get().find((candidate) => candidate.spec.id === id);
    if (!entry) return null;
    const ctx = this.contextFor(request);
    if (entry.spec.visible && !entry.spec.visible(ctx)) return null;
    return this.describe(entry.spec, ctx, detectPlatform());
  }

  /**
   * Ranked search over the palette's commands (visible, `palette` not
   * false): title prefix > title substring > keyword. Enabled commands
   * sort before disabled ones. Empty query: everything, in registration
   * order, enabled first.
   */
  readonly search = this.computedFor((query: string): readonly CommandState[] => {
    const listed = this.list().filter((state) => this.specOf(state.id)?.palette !== false);
    const needle = query.trim().toLowerCase();
    const ranked: Array<{ state: CommandState; rank: number }> = [];
    for (const state of listed) {
      const title = state.title.toLowerCase();
      const rank = !needle
        ? 0
        : title.startsWith(needle)
          ? 0
          : title.includes(needle)
            ? 1
            : (state.keywords ?? []).some((keyword) => keyword.toLowerCase().includes(needle))
              ? 2
              : -1;
      if (rank >= 0) ranked.push({ state, rank: rank + (state.disabledReason === undefined ? 0 : 10) });
    }
    return ranked.sort((a, b) => a.rank - b.rank).map((entry) => entry.state);
  }, 'search');

  /**
   * A menu entry for a command: its title, shortcut text, checked state,
   * and disabled reason from the registry, and a `run` that goes through
   * `execute` with `source: 'menu'`. Null when the command is unknown or
   * hidden for this target.
   */
  menuItem(id: string, options: { readonly args?: unknown; readonly target?: unknown; readonly label?: string } = {}): MenuAction | null {
    const state = this.stateOf(id, { source: 'menu', target: options.target });
    if (!state) return null;
    return {
      id: state.id,
      label: options.label ?? state.title,
      shortcut: state.shortcut,
      keywords: state.keywords,
      checked: state.checked === undefined ? undefined : state.checked === true,
      disabled: state.disabledReason !== undefined ? true : undefined,
      disabledReason: state.disabledReason,
      run: () => void this.execute(id, options.args, { source: 'menu', target: options.target })
    };
  }

  /**
   * The one run path. In order: find the command (`unknown`), build the
   * context, check `visible` (`hidden`), check `enabled` (`disabled` with
   * the reason), fill arguments (`failed` naming a missing field for the
   * API and agents; the args prompt for people, `cancelled` if dismissed),
   * run, then call every `onExecute` hook.
   *
   * When nothing needs asking, `run` is called before this returns, so a
   * synchronous command has finished by the time the caller moves on. The
   * promise settles after an async `run` does.
   */
  readonly execute = this.action(
    (id: string, args?: unknown, options: ExecuteOptions = {}): Promise<ExecuteResult> => {
      const request: CommandRequest = {
        source: options.source ?? 'api',
        target: options.target,
        actor: options.actor
      };
      const settle = (result: ExecuteResult, durationMs = 0): ExecuteResult => {
        const event: ExecuteEvent = { id, args, ...request, result, durationMs };
        for (const hook of this.hooks.get()) hook(event);
        return result;
      };
      const spec = this.specOf(id);
      if (!spec) {
        if (isWheelDevMode()) logger.warn(`execute('${id}'): no command has this id.`);
        return Promise.resolve(settle({ ok: false, why: 'unknown' }));
      }
      const ctx = this.contextFor(request);
      if ((spec.visible && !spec.visible(ctx)) || (request.source === 'agent' && spec.agent === false)) {
        return Promise.resolve(settle({ ok: false, why: 'hidden' }));
      }
      const reason = enabledState(spec, ctx);
      if (reason !== undefined) {
        if (request.source === 'key' && this.settings.blockedKeyFeedback === 'toast') {
          this.toastService.flash('wheel.command.blocked', reason);
        }
        return Promise.resolve(settle({ ok: false, why: 'disabled', reason }));
      }
      const filled = this.fillArgs(spec, args, ctx);
      if ('error' in filled) return Promise.resolve(settle({ ok: false, why: 'failed', message: filled.error }));
      if (filled.missing.length === 0) return this.runNow(spec, ctx, filled.values, settle);

      const prompt = this.argsPrompt.get();
      const fieldList = filled.missing.map((name) => `'${name}'`).join(', ');
      if (HEADLESS_SOURCES.has(request.source) || !prompt) {
        return Promise.resolve(settle({ ok: false, why: 'failed', message: `Missing argument ${fieldList}` }));
      }
      return prompt({
        command: this.describe(spec, ctx, detectPlatform()),
        fields: (spec.args ?? {}) as unknown as Record<string, AnyArgField>,
        missing: filled.missing,
        values: filled.values,
        ctx
      }).then((answer) => {
        if (answer === null) return settle({ ok: false, why: 'cancelled' });
        const again = this.fillArgs(spec, { ...filled.values, ...answer }, ctx);
        if ('error' in again) return settle({ ok: false, why: 'failed', message: again.error });
        if (again.missing.length > 0) {
          return settle({ ok: false, why: 'failed', message: `Missing argument ${again.missing.map((name) => `'${name}'`).join(', ')}` });
        }
        return this.runNow(spec, ctx, again.values, settle);
      });
    },
    'execute'
  );

  private specOf(id: string): StoredSpec | undefined {
    return this.registered.get().find((entry) => entry.spec.id === id)?.spec;
  }

  private describe(spec: StoredSpec, ctx: CommandContext, platform: KeyPlatform): CommandState {
    const shown = platformKeys(spec, platform).filter((key) => key.display !== false);
    return {
      id: spec.id,
      title: typeof spec.title === 'function' ? spec.title(ctx) : spec.title,
      group: spec.group,
      subtitle: typeof spec.subtitle === 'function' ? spec.subtitle(ctx) : spec.subtitle,
      icon: spec.icon,
      keywords: spec.keywords,
      shortcut: shown[0] ? formatCombo(shown[0].key, platform) : undefined,
      keys: shown.length > 0 ? shown.map((key) => key.key) : undefined,
      checked: spec.checked?.(ctx),
      disabledReason: enabledState(spec, ctx)
    };
  }

  /** Register one KeyboardService binding per key that applies here. */
  private bindKeys(spec: StoredSpec): () => void {
    const unbinds = platformKeys(spec, detectPlatform()).map((key, index) =>
      this.keyboardService.register({
        id: index === 0 ? `command:${spec.id}` : `command:${spec.id}#${index}`,
        key: key.key,
        command: spec.id,
        description: typeof spec.title === 'string' ? spec.title : spec.id,
        scope: key.scope,
        inInputs: key.inInputs,
        inOverlays: key.inOverlays,
        // A hidden command's key falls through to the next binding, so the
        // visible rule is the binding's gate. `enabled` is NOT a gate: a
        // disabled command still owns its key and says why.
        when: () => {
          const ctx = this.contextFor({ source: 'key' });
          return (spec.visible?.(ctx) ?? true) && (key.when?.(ctx) ?? true);
        },
        run: () => void this.execute(spec.id, undefined, { source: 'key' })
      })
    );
    return () => {
      for (const unbind of unbinds) unbind();
    };
  }

  /** Merge passed values and `initial` defaults; report the first bad value. */
  private fillArgs(
    spec: StoredSpec,
    args: unknown,
    ctx: CommandContext
  ): { readonly values: Record<string, unknown>; readonly missing: readonly string[] } | { readonly error: string } {
    const fields = (spec.args ?? {}) as unknown as Record<string, AnyArgField>;
    const passed = args && typeof args === 'object' ? (args as Record<string, unknown>) : {};
    const values: Record<string, unknown> = { ...passed };
    const missing: string[] = [];
    for (const [name, field] of Object.entries(fields)) {
      let value = passed[name];
      if (value === undefined) value = field.initial?.(ctx);
      if (value === undefined) {
        if (!field.optional) missing.push(name);
        continue;
      }
      const error = argError(name, field, value, ctx);
      if (error) return { error };
      values[name] = value;
    }
    return { values, missing };
  }

  private runNow(
    spec: StoredSpec,
    ctx: CommandContext,
    values: Record<string, unknown>,
    settle: (result: ExecuteResult, durationMs?: number) => ExecuteResult
  ): Promise<ExecuteResult> {
    const startedAt = this.now();
    const fail = (error: unknown): ExecuteResult => {
      logger.error(`Command '${spec.id}' failed`, error);
      return settle(
        { ok: false, why: 'failed', message: error instanceof Error ? error.message : String(error) },
        this.now() - startedAt
      );
    };
    let outcome: void | Promise<void>;
    try {
      outcome = spec.run(ctx, spec.args ? values : undefined);
    } catch (error) {
      return Promise.resolve(fail(error));
    }
    if (outcome instanceof Promise) {
      return outcome.then(
        () => settle({ ok: true }, this.now() - startedAt),
        (error: unknown) => fail(error)
      );
    }
    return Promise.resolve(settle({ ok: true }, this.now() - startedAt));
  }
}
