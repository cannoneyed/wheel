/**
 * The dock's extension seam: how a surface OUTSIDE `debug` gets a pane.
 *
 * The layering DAG runs `annotate → debug`, not the other way, so the dock
 * cannot import the annotator to render it — and should not want to. It owns
 * a shell; what fills the shell is the caller's business.
 *
 * So panes register themselves. `WheelAnnotate` adds one on mount and takes it
 * away on cleanup, and the dock renders whatever is present. A build that never
 * mounts the annotator has no annotate pane and no annotate code, which is the
 * same split the lazy chunk already makes.
 *
 * Deliberately module-level rather than context-scoped: the dock is one shell
 * per page, and a pane belongs to the page's tooling, not to a service scope.
 * Registering the same pane id twice replaces it, so a hot reload cannot leave
 * two.
 *
 * A pane is the ONLY way its surface is reached. Annotation is a thing you do
 * to a wheel app, so it lives where the app's other instruments live rather
 * than floating over the page on its own button.
 */
import { createSignal, type JSX } from 'solid-js';

import type { ServiceContext } from '../core/services';

/** A pane contributed to the debug dock by a surface the dock cannot import. */
export interface DebugPane {
  /** Stable id — the persistence key for "is this pane showing" and its width. */
  readonly id: string;
  /** Short lowercase name for the toggle bar. */
  readonly label: string;
  /** One glyph for the toggle bar. */
  readonly icon: string;
  /** Relative width against the other panes. */
  readonly weight: number;
  /** The pane's body. */
  render(services: ServiceContext): JSX.Element;
}

const [panes, setPanes] = createSignal<readonly DebugPane[]>([]);

/**
 * Add a pane to the dock. Returns the cleanup that removes it again.
 *
 * Call it from a component's setup and pass the result to `onCleanup`, so a
 * page that unmounts the annotator loses its pane with it.
 */
export function registerDebugPane(pane: DebugPane): () => void {
  setPanes((current) => [...current.filter((other) => other.id !== pane.id), pane]);
  return () => setPanes((current) => current.filter((other) => other !== pane));
}

/** Every registered pane, in registration order. Reactive. */
export function debugPanes(): readonly DebugPane[] {
  return panes();
}
