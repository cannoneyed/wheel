// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  bootstrapConfigSource,
  defineConfig,
  fetchConfigSource,
  urlConfigSource,
  valueConfigSource,
  z
} from './index';

describe('application config', () => {
  const definition = defineConfig(
    z.object({
      apiUrl: z.string(),
      debug: z.boolean().default(false),
      limit: z.number().int().positive().default(10),
      tags: z.array(z.string()).default([]),
      feature: z.object({ enabled: z.boolean(), color: z.string() })
    })
  );

  it('loads sources in order with later top-level fields winning', async () => {
    const host = {
      __APP_CONFIG__: {
        apiUrl: '/bootstrap',
        limit: 5,
        feature: { enabled: false, color: 'blue' }
      }
    };
    const requests: Array<{ input: string; credentials: RequestCredentials | undefined }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push({ input: String(input), credentials: init?.credentials });
      return Response.json({
        apiUrl: '/api',
        feature: { enabled: true, color: 'green' }
      });
    };

    const config = await definition.load([
      bootstrapConfigSource({ key: '__APP_CONFIG__', host }),
      fetchConfigSource('/api/config', {
        fetch: fetchImpl,
        init: { credentials: 'include' }
      }),
      urlConfigSource({
        search: '?config.debug=true&config.limit=25&config.tags=alpha&config.tags=beta&route=ignored',
        prefix: 'config.'
      })
    ]);

    expect(config).toEqual({
      apiUrl: '/api',
      debug: true,
      limit: 25,
      tags: ['alpha', 'beta'],
      feature: { enabled: true, color: 'green' }
    });
    expect(requests).toEqual([{ input: '/api/config', credentials: 'include' }]);
  });

  it('skips absent bootstrap data and applies Zod defaults', async () => {
    const config = await definition.load([
      bootstrapConfigSource({ host: {} }),
      valueConfigSource('base', {
        apiUrl: '/base',
        feature: { enabled: false, color: 'gray' }
      })
    ]);
    expect(config).toMatchObject({ debug: false, limit: 10, tags: [] });
  });

  it('serializes and deserializes through the same schema', () => {
    const value = {
      apiUrl: '/api',
      feature: { enabled: true, color: 'green' }
    };
    const serialized = definition.serialize(value);
    expect(definition.deserialize(serialized)).toEqual({
      ...value,
      debug: false,
      limit: 10,
      tags: []
    });
    expect(() => definition.deserialize('{nope')).toThrow(/Configuration JSON is invalid/);
  });

  it('rejects non-JSON sources and schema outputs at named boundaries', async () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    await expect(
      definition.load([valueConfigSource('bad-bootstrap', cyclic)])
    ).rejects.toThrow(/configuration source 'bad-bootstrap'.*cycle/);

    const dateDefinition = defineConfig(z.object({ releasedAt: z.date() }));
    expect(() => dateDefinition.parse({ releasedAt: new Date(0) })).toThrow(
      /configuration schema output\.releasedAt contains a non-plain object/
    );
  });

  it('names failing fetch sources and status codes', async () => {
    const source = fetchConfigSource('/api/config', {
      name: 'production API',
      fetch: async () => new Response(null, { status: 503, statusText: 'Unavailable' })
    });
    await expect(definition.load([source])).rejects.toThrow(
      /Configuration source 'production API' failed: HTTP 503 Unavailable/
    );
  });
});
