import type { CollectionDecl, MutationDecl } from '../declarations';

function isClientDeclaration(value: unknown): value is MutationDecl | CollectionDecl {
  if (typeof value !== 'object' || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === 'mutation' || kind === 'collection';
}

/** Client declarations used to restore durable commands by name. */
export interface ClientDeclarationRegistry {
  readonly collections: ReadonlyMap<string, CollectionDecl>;
  readonly mutations: ReadonlyMap<string, MutationDecl>;
}

/** Collect client-safe declarations without importing server registry code. */
export function collectClientDeclarations(syncModules: readonly object[]): ClientDeclarationRegistry {
  const collections = new Map<string, CollectionDecl>();
  const mutations = new Map<string, MutationDecl>();
  for (const syncModule of syncModules) {
    for (const value of Object.values(syncModule)) {
      if (!isClientDeclaration(value)) continue;
      const map = value.kind === 'collection' ? collections : mutations;
      const existing = map.get(value.name);
      if (existing && existing !== value) {
        throw new Error(`Duplicate client ${value.kind} declaration "${value.name}".`);
      }
      if (value.kind === 'collection') collections.set(value.name, value);
      else mutations.set(value.name, value);
    }
  }
  return { collections, mutations };
}
