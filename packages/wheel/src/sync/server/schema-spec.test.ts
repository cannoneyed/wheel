import { describe, expect, test } from 'vitest';

import { mutation, presence, query, table } from '../declarations';
import { t } from '../schema';
import { sql } from '../sql';
import { serveMutation, serveQuery } from './serve';
import { createSchemaSpec, stringifySchemaSpec } from './schema-spec';

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
      schemaSpecVersion: 1,
      protocolVersion: 2,
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
