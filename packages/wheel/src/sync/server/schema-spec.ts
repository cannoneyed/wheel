import type { CollectionDecl } from '../declarations';
import { ROW_SCHEMA_FINGERPRINT_PREFIX, type RowSchemaFingerprint } from '../row-schema';
import { toContractJsonSchema, type JsonSchema } from '../schema';
import { SYNC_PROTOCOL_VERSION } from '../socket-protocol';
import { buildRegistry } from './registry';

/** Version of the generated document shape. Independent from the wire version. */
export const WHEEL_SCHEMA_SPEC_VERSION = 4 as const;

const SET_LIKE_SCHEMA_ARRAYS = new Set(['allOf', 'anyOf', 'enum', 'oneOf', 'required', 'type']);

/** Serializable row-key rule shared by sync engines in every language. */
export interface SchemaSpecKey {
  readonly fields: readonly string[];
  readonly separator: string;
}

/** One collection's wire row shape and identity rule. */
export interface SchemaSpecCollection {
  readonly name: string;
  readonly jsonSchema: JsonSchema;
  readonly key: SchemaSpecKey;
}

/** One query's input shape, output collection, and physical dependencies. */
export interface SchemaSpecQuery {
  readonly name: string;
  readonly into: string;
  readonly paramsSchema: JsonSchema;
  readonly dependsOn: readonly string[];
}

/** One mutation's language-neutral argument shape. */
export interface SchemaSpecMutation {
  readonly name: string;
  readonly argsSchema: JsonSchema;
}

/** Optional application presence shape used to check server registration. */
export interface SchemaSpecPresence {
  readonly name: string;
  readonly stateSchema: JsonSchema;
}

/** Complete language-neutral application contract consumed by external sync engines. */
export interface WheelSchemaSpec {
  readonly schemaSpecVersion: typeof WHEEL_SCHEMA_SPEC_VERSION;
  readonly protocolVersion: typeof SYNC_PROTOCOL_VERSION;
  readonly rowSchemaFingerprint: RowSchemaFingerprint;
  readonly collections: readonly SchemaSpecCollection[];
  readonly queries: readonly SchemaSpecQuery[];
  readonly mutations: readonly SchemaSpecMutation[];
  readonly presence: SchemaSpecPresence | null;
}

function canonicalJson(value: unknown, parentKey?: string): unknown {
  if (Array.isArray(value)) {
    const entries = value.map((entry) => canonicalJson(entry));
    if (parentKey && SET_LIKE_SCHEMA_ARRAYS.has(parentKey)) {
      entries.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    }
    return entries;
  }
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalJson(entry, key)])
  );
}

/** Hash only the declarations that control cached row shape, identity, and ownership. */
export async function fingerprintSnapshotRows(spec: {
  readonly collections: readonly SchemaSpecCollection[];
  readonly queries: readonly Pick<SchemaSpecQuery, 'name' | 'into'>[];
}): Promise<RowSchemaFingerprint> {
  const input = {
    collections: [...spec.collections]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((collection) => ({
        name: collection.name,
        jsonSchema: canonicalJson(collection.jsonSchema),
        key: {
          fields: [...collection.key.fields],
          separator: collection.key.separator
        }
      })),
    queries: [...spec.queries]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((query) => ({ name: query.name, into: query.into }))
  };
  const canonical = JSON.stringify(canonicalJson(input));
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical)
  );
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
  return `${ROW_SCHEMA_FINGERPRINT_PREFIX}${hex}`;
}

function assertKeySchema(collection: CollectionDecl, jsonSchema: JsonSchema): void {
  const schema = jsonSchema as Record<string, unknown>;
  const properties = schema.properties;
  const required = schema.required;
  if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) {
    throw new Error(`Collection "${collection.name}" must export an object JSON Schema with properties.`);
  }
  if (!Array.isArray(required)) {
    throw new Error(`Collection "${collection.name}" must export required key fields.`);
  }
  for (const field of collection.keySpec.fields) {
    const fieldSchema = (properties as Record<string, unknown>)[field];
    if (!required.includes(field)) {
      throw new Error(`Collection "${collection.name}" key field ${JSON.stringify(field)} must be required.`);
    }
    if (
      typeof fieldSchema !== 'object' ||
      fieldSchema === null ||
      Array.isArray(fieldSchema) ||
      (fieldSchema as Record<string, unknown>).type !== 'string'
    ) {
      throw new Error(`Collection "${collection.name}" key field ${JSON.stringify(field)} must be a string.`);
    }
  }
}

/** Build a stable schema document from the same declarations and bindings the TypeScript engine boots. */
export async function createSchemaSpec(options: {
  readonly syncModules: object[];
  readonly servers: object[];
}): Promise<WheelSchemaSpec> {
  const registry = buildRegistry(options);
  const collections = [...registry.collections.values()]
    .map((collection): SchemaSpecCollection => {
      const jsonSchema = toContractJsonSchema(
        `Collection "${collection.name}"`,
        collection.schema
      );
      assertKeySchema(collection, jsonSchema);
      return {
        name: collection.name,
        jsonSchema,
        key: {
          fields: [...collection.keySpec.fields],
          separator: collection.keySpec.separator
        }
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const queries = [...registry.queries.values()]
    .map((query): SchemaSpecQuery => {
      return {
        name: query.name,
        into: query.into.name,
        paramsSchema: toContractJsonSchema(`Query "${query.name}" params`, query.params),
        dependsOn: [...query.dependsOn].sort()
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const mutations = [...registry.mutations.values()]
    .map(
      (mutation): SchemaSpecMutation => ({
        name: mutation.name,
        argsSchema: toContractJsonSchema(`Mutation "${mutation.name}" args`, mutation.args)
      })
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const presence = registry.presence
    ? {
        name: registry.presence.name,
        stateSchema: toContractJsonSchema(
          `Presence "${registry.presence.name}" state`,
          registry.presence.state
        )
      }
    : null;
  return {
    schemaSpecVersion: WHEEL_SCHEMA_SPEC_VERSION,
    protocolVersion: SYNC_PROTOCOL_VERSION,
    rowSchemaFingerprint: await fingerprintSnapshotRows({ collections, queries }),
    collections,
    queries,
    mutations,
    presence
  };
}

/** Canonical checked-in artifact form. */
export function stringifySchemaSpec(spec: WheelSchemaSpec): string {
  return `${JSON.stringify(spec, null, 2)}\n`;
}
