import { execFileSync } from 'node:child_process';

import { branchKey } from './branch-key';

const PRODUCTION_SITE_URL = 'https://wheel.dev';
const WORKERS_DEV_DOMAIN = 'cannoneyed.workers.dev';

/** Read the checked-out branch without accepting a detached HEAD. */
export function currentGitBranch(): string {
  let branch: string;
  try {
    branch = execFileSync('git', ['branch', '--show-current'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch {
    throw new Error('Could not read the current Git branch. Pass a branch name explicitly.');
  }
  if (branch === '') {
    throw new Error('Detached HEAD has no branch preview URL. Pass a branch name explicitly.');
  }
  return branch;
}

/** Use an explicit branch when supplied, otherwise read the current checkout. */
export function previewBranch(
  argument: string | undefined,
  readCurrentBranch: () => string = currentGitBranch
): string {
  if (argument === undefined) return readCurrentBranch();
  const branch = argument.trim();
  if (branch === '') throw new Error('Branch name must not be empty.');
  return branch;
}

/** Return the deployed website URL for one branch. */
export function previewWebsiteUrl(branch: string): string {
  const name = branch.trim();
  if (name === 'main') return PRODUCTION_SITE_URL;
  return `https://wheel-site-${branchKey(name)}.${WORKERS_DEV_DOMAIN}`;
}

if (import.meta.main) {
  console.log(previewWebsiteUrl(previewBranch(process.argv[2])));
}
