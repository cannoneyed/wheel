import { applySeed } from '../packages/tracker/seed/seed';

interface Operation {
  readonly sql: string;
  readonly params: readonly unknown[];
}

const operations: Operation[] = [];

await applySeed({
  async query(sql, params = []) {
    operations.push({ sql, params });
    return [];
  }
});

const output = new URL('../packages/tracker/server/seed-operations.json', import.meta.url);
const generated = `${JSON.stringify(operations)}\n`;

if (process.argv.includes('--check')) {
  const current = await Bun.file(output).text();
  if (current !== generated) {
    throw new Error('Tracker seed operations are stale. Run bun run seed:tracker.');
  }
  console.log(`checked ${operations.length} Tracker seed operations`);
} else {
  await Bun.write(output, generated);
  console.log(`wrote ${operations.length} Tracker seed operations`);
}
