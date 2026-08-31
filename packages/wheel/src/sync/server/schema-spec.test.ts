import { describe, expect, test } from 'vitest';

import { mutation, presence, query, table } from '../declarations';
import { t } from '../schema';
import { sql } from '../sql';
import { serveMutation, serveQuery } from './serve';
import {
  createSchemaSpec,
  fingerprintSnapshotRows,
  stringifySchemaSpec,
  type WheelSchemaSpec
} from './schema-spec';

function fixture() {
  const memberships = table({
    name: 'memberships',
    type: t.object({ orgId: t.string(), userId: t.string(), role: t.string() }),
    key: (row) => `${row.orgId}:${row.userId}`,
    keySpec: { fields: ['orgId', 'userId'], separator: ':' }
  });
  const all = query({ name: 'memberships.all', params: t.object({}), into: memberships });
  const add = mutation({
    name: 'memberships.add',
    args: t.object({ orgId: t.string(), userId: t.string() })
  });
  const cursors = presence({
    name: 'cursors',
    state: t.object({ rowId: t.string().nullable() })
  });
  const syncModule = { memberships, all, add, cursors };
  const servers = {
    allServer: serveQuery({
      query: all,
      sql: () => sql`select org_id, user_id, role from memberships`,
      rerunOn: ['memberships']
    }),
    addServer: serveMutation({ mutation: add, handler: async () => {} })
  };
  return { syncModule, servers };
}

describe('createSchemaSpec', () => {
  test('emits schemas, composite keys, rerun hints, and presence', () => {
    const { syncModule, servers } = fixture();
    const spec = createSchemaSpec({ syncModules: [syncModule], servers: [servers] });
    expect(spec).toMatchObject({
      schemaSpecVersion: 2,
      protocolVersion: 3,
      rowSchemaFingerprint: expect.stringMatching(/^wheel-rows-sha256:[0-9a-f]{64}$/),
      tables: [
        {
          name: 'memberships',
          virtual: false,
          key: { fields: ['orgId', 'userId'], separator: ':' }
        }
      ],
      queries: [
        { name: 'memberships.all', into: 'memberships', rerunOn: ['memberships'] }
      ],
      mutations: [{ name: 'memberships.add' }],
      presence: { name: 'cursors' }
    });
    expect(spec.tables[0]!.jsonSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['orgId', 'userId', 'role']
    });
    expect(stringifySchemaSpec(spec).endsWith('\n')).toBe(true);
  });

  test('fingerprints cached row shape, identity, and query ownership only', () => {
    const { syncModule, servers } = fixture();
    const spec = createSchemaSpec({ syncModules: [syncModule], servers: [servers] });
    const original = spec.rowSchemaFingerprint;
    const table = spec.tables[0]!;
    const query = spec.queries[0]!;
    const schema = table.jsonSchema as Record<string, unknown>;
    const properties = schema.properties as Record<string, unknown>;
    const required = schema.required as string[];

    const reordered: WheelSchemaSpec = {
      ...spec,
      tables: [
        {
          ...table,
          jsonSchema: {
            ...Object.fromEntries(Object.entries(schema).reverse()),
            properties: Object.fromEntries(Object.entries(properties).reverse()),
            required: [...required].reverse()
          }
        }
      ]
    };
    expect(fingerprintSnapshotRows(reordered)).toBe(original);

    const archiveTable = { ...table, name: 'memberships_archive' };
    const archiveQuery = { ...query, name: 'memberships.archive', into: archiveTable.name };
    const twoContracts = { tables: [table, archiveTable], queries: [query, archiveQuery] };
    expect(
      fingerprintSnapshotRows({
        tables: [...twoContracts.tables].reverse(),
        queries: [...twoContracts.queries].reverse()
      })
    ).toBe(fingerprintSnapshotRows(twoContracts));

    const unrelated = {
      ...spec,
      queries: [{ ...query, paramsSchema: { type: 'string' }, rerunOn: ['other'] }],
      mutations: [{ name: 'memberships.changed', argsSchema: { type: 'string' } }],
      presence: { name: 'changed', stateSchema: { type: 'string' } }
    };
    expect(fingerprintSnapshotRows(unrelated)).toBe(original);

    const withField = {
      ...spec,
      tables: [
        {
          ...table,
          jsonSchema: {
            ...schema,
            properties: { ...properties, tag: { type: 'string' } },
            required: [...required, 'tag']
          }
        }
      ]
    };
    expect(fingerprintSnapshotRows(withField)).not.toBe(original);
    expect(
      fingerprintSnapshotRows({
        ...spec,
        tables: [{ ...table, name: 'renamed_memberships' }]
      })
    ).not.toBe(original);
    expect(
      fingerprintSnapshotRows({
        ...spec,
        tables: [{ ...table, jsonSchema: { ...schema, required: required.slice(0, -1) } }]
      })
    ).not.toBe(original);
    expect(
      fingerprintSnapshotRows({
        ...spec,
        tables: [{ ...table, key: { ...table.key, fields: [...table.key.fields].reverse() } }]
      })
    ).not.toBe(original);
    expect(
      fingerprintSnapshotRows({
        ...spec,
        tables: [{ ...table, key: { ...table.key, separator: '|' } }]
      })
    ).not.toBe(original);
    expect(
      fingerprintSnapshotRows({ ...spec, tables: [{ ...table, virtual: !table.virtual }] })
    ).not.toBe(original);
    expect(
      fingerprintSnapshotRows({ ...spec, queries: [{ ...query, into: 'other_table' }] })
    ).not.toBe(original);
  });

  test('fails on Zod parse behavior that plain JSON Schema cannot reproduce', () => {
    const { syncModule, servers } = fixture();
    const bad = mutation({
      name: 'memberships.defaulted',
      args: t.object({ role: t.string().default('member') })
    });
    const badServer = serveMutation({ mutation: bad, handler: async () => {} });
    expect(() =>
      createSchemaSpec({
        syncModules: [{ ...syncModule, bad }],
        servers: [{ ...servers, badServer }]
      })
    ).toThrow(/input and output shapes differ/);
  });

  test('fails when key metadata does not name required string fields', () => {
    const { syncModule, servers } = fixture();
    const invalid = table({
      name: 'invalid_keys',
      type: t.object({ id: t.number() }),
      key: (row) => String(row.id),
      keySpec: { fields: ['id'] }
    });
    expect(() =>
      createSchemaSpec({
        syncModules: [{ ...syncModule, invalid }],
        servers: [servers]
      })
    ).toThrow(/key field "id" must be a string/);
  });
});
