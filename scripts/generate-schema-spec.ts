import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createSchemaSpec,
  stringifySchemaSpec
} from '../packages/wheel/src/sync/server/schema-spec';

const [modulePath, exportName, outputPath, mode] = process.argv.slice(2);
if (!modulePath || !exportName || !outputPath || (mode !== undefined && mode !== '--check')) {
  throw new Error(
    'Usage: bun scripts/generate-schema-spec.ts <module> <export> <output> [--check]'
  );
}

const moduleUrl = pathToFileURL(resolve(modulePath)).href;
const source = (await import(moduleUrl)) as Record<string, unknown>;
const input = source[exportName];
if (typeof input !== 'object' || input === null) {
  throw new Error(`${modulePath} does not export an object named ${JSON.stringify(exportName)}.`);
}
const options = input as { syncModules?: object[]; servers?: object[] };
if (!Array.isArray(options.syncModules) || !Array.isArray(options.servers)) {
  throw new Error(`${exportName} must contain syncModules and servers arrays.`);
}
const generated = stringifySchemaSpec(
  createSchemaSpec({ syncModules: options.syncModules, servers: options.servers })
);
const destination = resolve(outputPath);
if (mode === '--check') {
  let existing = '';
  try {
    existing = readFileSync(destination, 'utf8');
  } catch {
    // The comparison below reports the one actionable failure.
  }
  if (existing !== generated) {
    throw new Error(
      `${outputPath} is stale. Run the schema generation command and commit the result.`
    );
  }
} else {
  writeFileSync(destination, generated);
}
