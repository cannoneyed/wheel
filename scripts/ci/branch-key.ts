import { createHash } from 'node:crypto';

const READABLE_LENGTH = 30;

/** Return a stable, readable, collision-resistant key for one Git branch. */
export function branchKey(branch: string): string {
  const original = branch.trim();
  if (original === '') throw new Error('Branch name must not be empty.');
  const readable =
    original
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, READABLE_LENGTH)
      .replace(/-+$/g, '') || 'branch';
  const hash = createHash('sha256').update(original).digest('hex').slice(0, 8);
  return `${readable}-${hash}`;
}

if (import.meta.main) {
  const branch = process.argv[2];
  if (!branch) throw new Error('Usage: bun scripts/ci/branch-key.ts <branch>');
  console.log(branchKey(branch));
}
