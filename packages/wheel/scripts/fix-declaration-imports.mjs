import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const declarationsRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const relativeSpecifier = /((?:from\s+|import\s*\(\s*))(['"])(\.\.?\/[^'"]+|\.\.?)\2/g;

async function declarationFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? declarationFiles(path) : path.endsWith('.d.ts') ? [path] : [];
    })
  );
  return nested.flat();
}

const files = await declarationFiles(declarationsRoot);
const knownFiles = new Set(files);

for (const path of files) {
  const source = await readFile(path, 'utf8');
  const rewritten = source.replace(relativeSpecifier, (match, prefix, quote, specifier) => {
    const target = resolve(dirname(path), specifier);
    const resolvesToFile = knownFiles.has(`${target}.d.ts`);
    const resolvesToIndex = knownFiles.has(join(target, 'index.d.ts'));
    if (!resolvesToFile && !resolvesToIndex && extname(specifier)) {
      return match;
    }
    const suffix = resolvesToIndex ? '/index.js' : '.js';
    return `${prefix}${quote}${specifier}${suffix}${quote}`;
  });
  if (rewritten !== source) {
    await writeFile(path, rewritten);
  }
}
