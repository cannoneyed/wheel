import {
  bootstrapConfigSource,
  defineConfig,
  fetchConfigSource,
  urlConfigSource,
  z
} from 'wheel/config';

export const appConfig = defineConfig(
  z.object({
    apiUrl: z.string().url(),
    debug: z.boolean().default(false),
    pageSize: z.number().int().positive().default(25)
  })
);

export const config = await appConfig.load([
  bootstrapConfigSource(),
  fetchConfigSource('/api/config', {
    init: { credentials: 'include' }
  }),
  urlConfigSource({ prefix: 'config.' })
]);

export async function configForTest() {
  return appConfig.load([
    {
      name: 'test',
      load: () => ({ apiUrl: 'https://example.test' })
    },
    urlConfigSource({
      search: '?config.debug=true',
      prefix: 'config.'
    })
  ]);
}
