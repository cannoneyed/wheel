/**
 * Discovery for the states sidebar: vite globs every `*.states.tsx` in the
 * playground, wheel, and demos source trees at build time (the registry
 * knows component NAMES, not modules — discovery must be static). Adding a
 * states file anywhere in those trees adds its component to the sidebar with
 * no registration step.
 */
import type { AnyStatesDefinition } from 'wheel/core';

const modules = import.meta.glob<{ default: AnyStatesDefinition }>(
  ['./**/*.states.tsx', '../../wheel/src/**/*.states.tsx', '../../demos/src/**/*.states.tsx'],
  { eager: true }
);

/** Every discovered states definition, sorted by component name. */
export const STATE_DEFINITIONS: readonly AnyStatesDefinition[] = Object.values(modules)
  .map((module) => module.default)
  .sort((a, b) => a.name.localeCompare(b.name));
