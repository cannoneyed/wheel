/**
 * The registry collects declarations from sync modules (*.sync.ts) and cross-checks
 * them against server bindings at boot. Everything fails
 * loudly at startup, never at request time: duplicate names, declarations
 * without implementations, orphan implementations, rerun hints on undeclared
 * tables.
 */
import type { MutationDecl, PresenceDecl, QueryDecl, TableDecl } from '../declarations';

/** Boot-time failure listing every registry problem at once (duplicates, unimplemented declarations, orphan bindings, bad rerun hints) with declaration sites. */
export class RegistryError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Wheel registry is invalid:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
  }
}

function isTable(value: unknown): value is TableDecl {
  return typeof value === 'object' && value !== null && (value as TableDecl).kind === 'table';
}
function isQuery(value: unknown): value is QueryDecl {
  return typeof value === 'object' && value !== null && (value as QueryDecl).kind === 'query';
}
function isMutation(value: unknown): value is MutationDecl {
  return typeof value === 'object' && value !== null && (value as MutationDecl).kind === 'mutation';
}
function isPresence(value: unknown): value is PresenceDecl {
  return typeof value === 'object' && value !== null && (value as PresenceDecl).kind === 'presence';
}

/** The collected declarations of all sync modules (*.sync.ts), keyed by name. */
export interface SyncDeclarations {
  tables: Map<string, TableDecl>;
  queries: Map<string, QueryDecl>;
  mutations: Map<string, MutationDecl>;
  presence: PresenceDecl | null;
}

/**
 * Scan sync module exports for declarations. Modules are plain `import *`
 * namespaces (or any object of exports).
 */
export function collectDeclarations(syncModules: object[]): SyncDeclarations {
  const problems: string[] = [];
  const tables = new Map<string, TableDecl>();
  const queries = new Map<string, QueryDecl>();
  const mutations = new Map<string, MutationDecl>();
  const presences = new Map<string, PresenceDecl>();

  const add = <Decl extends { name: string; declSite: string }>(
    map: Map<string, Decl>,
    decl: Decl,
    kind: string
  ): void => {
    const existing = map.get(decl.name);
    if (existing && existing !== decl) {
      problems.push(
        `Duplicate ${kind} name "${decl.name}" declared at ${existing.declSite} and ${decl.declSite}.`
      );
      return;
    }
    map.set(decl.name, decl);
  };

  for (const syncModule of syncModules) {
    for (const value of Object.values(syncModule)) {
      if (isTable(value)) {
        add(tables, value, 'table');
      } else if (isQuery(value)) {
        add(queries, value, 'query');
      } else if (isMutation(value)) {
        add(mutations, value, 'mutation');
      } else if (isPresence(value)) {
        add(presences, value, 'presence');
      }
    }
  }

  if (presences.size > 1) {
    problems.push(
      `An application may declare one presence shape; found ${[...presences.keys()].map((name) => JSON.stringify(name)).join(', ')}.`
    );
  }

  // Queries can only target declared tables.
  for (const decl of queries.values()) {
    if (!tables.has(decl.into.name)) {
      problems.push(
        `Query "${decl.name}" (${decl.declSite}) targets table "${decl.into.name}", which is not exported by any syncModule.`
      );
    }
  }

  if (problems.length > 0) {
    throw new RegistryError(problems);
  }
  return { tables, queries, mutations, presence: presences.values().next().value ?? null };
}

/** Minimal shape of a server binding, as produced by serveQuery/serveMutation. */
export interface ServerBindingLike {
  readonly kind: 'serve-query' | 'serve-mutation';
  readonly name: string;
  readonly declSite: string;
  readonly query?: QueryDecl;
  readonly mutation?: MutationDecl;
  readonly handler?: { readonly rerunOn?: readonly string[]; readonly subscribe?: unknown };
}

/** The cross-checked pairing of syncModule declarations with their server bindings - what the engine executes against. */
export interface Registry extends SyncDeclarations {
  queryBindings: Map<string, ServerBindingLike>;
  mutationBindings: Map<string, ServerBindingLike>;
}

/**
 * Boot-time cross-check of syncModules against server bindings. Every query and
 * mutation must have exactly one implementation; no implementation may exist
 * without a declaration; rerun hints must name declared tables.
 */
export function buildRegistry(options: { syncModules: object[]; servers: object[] }): Registry {
  const declarations = collectDeclarations(options.syncModules);
  const problems: string[] = [];
  const queryBindings = new Map<string, ServerBindingLike>();
  const mutationBindings = new Map<string, ServerBindingLike>();

  const bindings: ServerBindingLike[] = [];
  for (const server of options.servers) {
    for (const value of Object.values(server)) {
      const binding = value as ServerBindingLike;
      if (
        typeof binding === 'object' &&
        binding !== null &&
        (binding.kind === 'serve-query' || binding.kind === 'serve-mutation')
      ) {
        bindings.push(binding);
      }
    }
  }

  for (const binding of bindings) {
    const [map, decls, label] =
      binding.kind === 'serve-query'
        ? ([queryBindings, declarations.queries, 'query'] as const)
        : ([mutationBindings, declarations.mutations, 'mutation'] as const);
    if (!decls.has(binding.name)) {
      problems.push(
        `Server binding for ${label} "${binding.name}" (${binding.declSite}) has no matching declaration in any syncModule.`
      );
      continue;
    }
    const registered = decls.get(binding.name);
    const boundDeclaration =
      binding.kind === 'serve-query' ? binding.query : binding.mutation;
    if (boundDeclaration !== registered) {
      problems.push(
        `Server binding for ${label} "${binding.name}" (${binding.declSite}) does not bind the exact declaration exported by the syncModule (${registered?.declSite}). Import and bind that declaration instead of recreating it.`
      );
      continue;
    }
    const existing = map.get(binding.name);
    if (existing && existing !== binding) {
      problems.push(
        `${label} "${binding.name}" is implemented twice: ${existing.declSite} and ${binding.declSite}.`
      );
      continue;
    }
    map.set(binding.name, binding);
    for (const hinted of binding.handler?.rerunOn ?? []) {
      if (!declarations.tables.has(hinted)) {
        problems.push(
          `${label} "${binding.name}" (${binding.declSite}) reruns on table "${hinted}", which is not declared in any syncModule.`
        );
      }
    }
  }

  for (const decl of declarations.queries.values()) {
    if (!queryBindings.has(decl.name)) {
      problems.push(`Query "${decl.name}" (${decl.declSite}) has no server implementation (serveQuery).`);
    }
  }
  for (const decl of declarations.mutations.values()) {
    if (!mutationBindings.has(decl.name)) {
      problems.push(`Mutation "${decl.name}" (${decl.declSite}) has no server implementation (serveMutation).`);
    }
  }

  if (problems.length > 0) {
    throw new RegistryError(problems);
  }
  return { ...declarations, queryBindings, mutationBindings };
}
