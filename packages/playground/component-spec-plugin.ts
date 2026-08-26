import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { Plugin } from 'vite';

const SPEC_MODULE_PREFIX = '\0component-spec:';

/** Loads component contracts as source text before a host application's Markdown pipeline. */
export function componentSpecSource(): Plugin {
  return {
    name: 'component-spec-source',
    enforce: 'pre',
    resolveId(id, importer) {
      const [file, query = ''] = id.split('?');
      if (!file || !new URLSearchParams(query).has('component-spec')) {
        return null;
      }
      const sourcePath = isAbsolute(file)
        ? file
        : resolve(importer ? dirname(importer) : '.', file);
      return `${SPEC_MODULE_PREFIX}${encodeURIComponent(sourcePath)}`;
    },
    async load(id) {
      if (!id.startsWith(SPEC_MODULE_PREFIX)) {
        return null;
      }
      const file = decodeURIComponent(id.slice(SPEC_MODULE_PREFIX.length));
      const source = await readFile(file, 'utf8');
      return `export default ${JSON.stringify(source)};`;
    },
  };
}
