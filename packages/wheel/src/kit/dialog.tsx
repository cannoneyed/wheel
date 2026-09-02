/**
 * The dialog system's service: which dialog is open (scalar atom — one at a
 * time, like the context menu) and the three doors in:
 *
 * 1. Built-ins: `await dialogs.confirm('Delete this item?')` / `.alert(...)`
 *    — promise-returning, rendered by the generic kit dialogs.
 * 2. Imperative custom: `dialogs.openDialog('delete-item', DeleteItemDialog,
 *    { confirm, cancel })` — a typed component + props; local data arrives
 *    through the closure props. Content renders at the ROOT context (opens
 *    happen in event handlers, where no owner is capturable).
 * 3. Declarative custom: `<Dialog id="delete-item" content={...}/>` declared
 *    in the tree registers with its OWNER captured — `dialogs.open(id)`
 *    later renders the content with the declaration site's full context
 *    (scoped service overrides included).
 *
 * `<DialogSystem/>` (dialog-system.tsx) owns portal/scrim/Escape/focus.
 */
import { getOwner, onCleanup, useContext, type Component, type JSX, type Owner } from 'solid-js';

import { Service } from '../core/services';
import { WheelContext } from '../core/context';
import { captureDeclSite } from '../core/decl-site';
import { ConfirmDialogView, AlertDialogView } from './dialog-kit';

/** What the system host renders for the open dialog. */
export interface OpenDialogEntry {
  readonly id: string;
  readonly render: () => JSX.Element;
  /** Declaration-site owner for declarative dialogs; null = render at root. */
  readonly owner: Owner | null;
  /** Settles the opener's promise (built-ins); dismissal settles with `dismissValue`. */
  readonly settle?: (value: unknown) => void;
  readonly dismissValue?: unknown;
}

/** Options for the confirm/alert built-ins. */
export interface ConfirmOptions {
  readonly title?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  readonly danger?: boolean;
}

interface DialogRegistration {
  readonly id: string;
  readonly render: () => JSX.Element;
  readonly owner: Owner | null;
  readonly declaredAt?: string;
}

interface StoredDialogRegistration extends DialogRegistration {
  readonly declaredAt: string;
}

/** Owns the open dialog and the registration map. One dialog at a time by construction. */
export class DialogService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'DialogService';

  /** State-tree group: wheel-internal plumbing, collapsed by default. */
  static override group = 'framework';

  private readonly registrations = new Map<string, StoredDialogRegistration>();
  // The ATOM holds only the scalar id (reactive, frozen-safe). The entry —
  // render thunk, captured Owner, promise settle — is a live runtime handle.
  // A field tracks it without freezing the Owner or making it reactive.
  private readonly currentEntry = this.field<OpenDialogEntry | null>(null);
  /** The open dialog's id, or null. */
  readonly openId = this.atom<string | null>(null, 'openId');
  /** @internal Changes for every entry, including same-id replacement. */
  readonly entryVersion = this.atom(0, 'entryVersion');

  /** @internal The system host reads the whole entry. */
  entry(): OpenDialogEntry | null {
    return this.currentEntry.get();
  }

  private setEntry(entry: OpenDialogEntry | null): void {
    const previous = this.currentEntry.get();
    this.currentEntry.set(entry);
    this.openId.set(entry?.id ?? null);
    this.entryVersion.set(this.entryVersion.get() + 1);
    if (previous && previous !== entry) {
      previous.settle?.(previous.dismissValue);
    }
  }

  /** Built-in confirmation. Resolves true on confirm; false on cancel/scrim/Escape. */
  readonly confirm = this.action((message: string, options: ConfirmOptions = {}): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const settle = (value: unknown) => resolve(value === true);
      this.setEntry({
        id: 'wheel:confirm',
        owner: null,
        settle,
        dismissValue: false,
        render: () =>
          ConfirmDialogView({
            message,
            options,
            respond: (value) => this.settleAndClose(value)
          })
      });
    });
  }, 'confirm');

  /** Built-in alert. Resolves when acknowledged (or dismissed). */
  readonly alert = this.action((message: string, options: Pick<ConfirmOptions, 'title' | 'confirmLabel'> = {}): Promise<void> => {
    return new Promise<void>((resolve) => {
      this.setEntry({
        id: 'wheel:alert',
        owner: null,
        settle: () => resolve(),
        dismissValue: undefined,
        render: () =>
          AlertDialogView({
            message,
            options,
            respond: () => this.settleAndClose(undefined)
          })
      });
    });
  }, 'alert');

  /**
   * Imperative custom dialog: a typed component + props. Local data flows
   * through the props closure; content renders at the root context.
   */
  readonly openDialog = this.action(<P extends Record<string, unknown>>(id: string, DialogComponent: Component<P>, props: P): void => {
    this.setEntry({ id, owner: null, render: () => DialogComponent(props) });
  }, 'openDialog');

  /** Open a DECLARATIVELY registered dialog by id (owner-captured content). */
  readonly open = this.action((id: string) => {
    const registration = this.registrations.get(id);
    if (!registration) {
      throw new Error(`DialogService.open('${id}'): no <Dialog id="${id}"> is registered.`);
    }
    this.setEntry({ id, owner: registration.owner, render: registration.render });
  }, 'open');

  /** Close whatever dialog is open, settling any pending built-in promise. */
  readonly close = this.action(() => this.settleAndClose(this.currentEntry.get()?.dismissValue), 'close');

  /** Close only if `id` is the open dialog (safe from stale handlers). */
  readonly closeDialog = this.action((id: string) => {
    const entry = this.currentEntry.get();
    if (entry?.id === id) {
      this.settleAndClose(entry.dismissValue);
    }
  }, 'closeDialog');

  private settleAndClose(value: unknown): void {
    const entry = this.currentEntry.get();
    if (!entry) return;
    this.currentEntry.set(null);
    this.openId.set(null);
    this.entryVersion.set(this.entryVersion.get() + 1);
    entry.settle?.(value);
  }

  /** @internal Declarative registration; returns the unregister function. */
  register(registration: DialogRegistration): () => void {
    const stored: StoredDialogRegistration = {
      ...registration,
      declaredAt:
        registration.declaredAt ??
        captureDeclSite(/\/kit\/dialog\.(?:tsx?|jsx?)/)
    };
    const existing = this.registrations.get(stored.id);
    if (existing) {
      throw new Error(
        `Duplicate dialog id '${stored.id}'. First registered at ${existing.declaredAt}; duplicate registered at ${stored.declaredAt}.`
      );
    }
    this.registrations.set(stored.id, stored);
    return () => {
      if (this.registrations.get(stored.id) !== stored) return;
      this.registrations.delete(stored.id);
      if (this.currentEntry.get()?.id === stored.id) {
        this.close();
      }
    };
  }
}

/**
 * Declarative dialog registration — mounts nothing; captures its owner so
 * `dialogService.open(id)` renders `content` with THIS site's context
 * (scoped service overrides included):
 *
 *   <Dialog id="delete-item" content={() => <DeleteItemDialog … />} />
 */
export function Dialog(props: { id: string; content: () => JSX.Element }): null {
  const context = useContext(WheelContext);
  if (!context) {
    throw new Error('<Dialog> used outside a WheelProvider/ServiceProvider');
  }
  const service = context.services.get(DialogService);
  const owner = getOwner();
  const unregister = service.register({
    id: props.id,
    render: props.content,
    owner,
    declaredAt: captureDeclSite(/\/kit\/dialog\.(?:tsx?|jsx?)/)
  });
  onCleanup(unregister);
  return null;
}
