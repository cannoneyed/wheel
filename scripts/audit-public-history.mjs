import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = join(root, '.artifacts/public-audit');
const releaseRoot = join(root, '.artifacts/npm');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'wheel-public-audit-'));
const mirrorRoot = join(temporaryRoot, 'wheel.git');
const extractedPackageRoot = join(temporaryRoot, 'package');

function run(command, args, cwd = root, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: options.encoding ?? 'utf8',
    input: options.input,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }
  });
  if (options.allowedStatuses?.includes(result.status)) return result;
  if (result.status !== 0) {
    throw new Error(
      [`${command} ${args.join(' ')} failed`, result.stdout, result.stderr]
        .filter(Boolean)
        .join('\n')
    );
  }
  return result;
}

async function writeReport(name, contents) {
  const path = join(outputRoot, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

function lines(text) {
  return text.split('\n').filter(Boolean);
}

function githubRepository(remote) {
  const match = remote.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!match) throw new Error(`Cannot read GitHub repository from ${remote}.`);
  return `${match[1]}/${match[2]}`;
}

async function filesBelow(path) {
  const found = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) found.push(...await filesBelow(entryPath));
    else found.push(entryPath);
  }
  return found;
}

try {
  if (run('git', ['status', '--porcelain']).stdout.trim()) {
    throw new Error('Commit all release work before the public-history audit.');
  }

  const sourceCommit = run('git', ['rev-parse', 'HEAD']).stdout.trim();
  const remote = run('git', ['remote', 'get-url', 'origin']).stdout.trim();
  const repository = githubRepository(remote);
  const release = JSON.parse(
    await readFile(join(releaseRoot, 'wheel-release.json'), 'utf8')
  );
  if (release.sourceCommit !== sourceCommit) {
    throw new Error('Run package:wheel from the final commit before the public-history audit.');
  }

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  run('git', ['clone', '--mirror', remote, mirrorRoot], temporaryRoot);

  const remoteHead = run('git', ['rev-parse', 'HEAD'], mirrorRoot).stdout.trim();
  if (remoteHead !== sourceCommit) {
    throw new Error(`Remote HEAD ${remoteHead} does not match release commit ${sourceCommit}.`);
  }

  const refs = run(
    'git',
    ['for-each-ref', '--format=%(refname)\t%(objectname)\t%(objecttype)'],
    mirrorRoot
  ).stdout;
  const commitCount = Number(run('git', ['rev-list', '--all', '--count'], mirrorRoot).stdout);
  const commitMetadata = run(
    'git',
    [
      'log',
      '--all',
      '--date=iso-strict',
      '--format=commit %H%nparents %P%nauthor %aN <%aE>%nauthor-date %aI%ncommitter %cN <%cE>%ncommitter-date %cI%n%n%B%n----'
    ],
    mirrorRoot
  ).stdout;
  const historyPatch = run(
    'git',
    [
      'log',
      '--all',
      '--full-history',
      '--binary',
      '--date=iso-strict',
      '--format=commit %H%nAuthor: %aN <%aE>%nDate: %aI%n%n%B',
      '--patch',
      '--find-renames',
      '--find-copies'
    ],
    mirrorRoot
  ).stdout;
  const historicalPaths = [...new Set(lines(run(
    'git',
    ['log', '--all', '--name-only', '--format='],
    mirrorRoot
  ).stdout))].sort();

  const objectNames = run('git', ['rev-list', '--objects', '--all'], mirrorRoot).stdout;
  const objects = run(
    'git',
    ['cat-file', '--batch-check=%(objectname)\t%(objecttype)\t%(objectsize)\t%(rest)'],
    mirrorRoot,
    { input: objectNames }
  ).stdout;
  const blobs = lines(objects)
    .map((line) => {
      const [object, type, rawSize, ...pathParts] = line.split('\t');
      return { object, type, size: Number(rawSize), path: pathParts.join('\t') };
    })
    .filter((item) => item.type === 'blob')
    .sort((left, right) => right.size - left.size || left.path.localeCompare(right.path));

  const authorLines = lines(run(
    'git',
    ['log', '--all', '--format=%aN <%aE>%n%cN <%cE>'],
    mirrorRoot
  ).stdout);
  const authors = [...new Set(authorLines)].sort();
  const suspiciousPaths = historicalPaths.filter((path) =>
    /(^|\/)(\.env|\.npmrc|credentials?|secrets?|tokens?|id_[rd]sa)(\.|\/|$)|\.(pem|key|p12|mobileprovision)$/i.test(path)
  );

  await writeReport('refs.tsv', refs);
  await writeReport('commits.txt', commitMetadata);
  await writeReport('history.patch', historyPatch);
  await writeReport('historical-paths.txt', `${historicalPaths.join('\n')}\n`);
  await writeReport('objects.tsv', objects);
  await writeReport(
    'large-blobs.tsv',
    `size\tobject\tpath\n${blobs.map((blob) => `${blob.size}\t${blob.object}\t${blob.path}`).join('\n')}\n`
  );
  await writeReport('authors.txt', `${authors.join('\n')}\n`);
  await writeReport('suspicious-paths.txt', `${suspiciousPaths.join('\n')}\n`);

  const gitLeaksPath = join(outputRoot, 'gitleaks-history.json');
  const gitLeaks = run(
    'gitleaks',
    [
      'git',
      mirrorRoot,
      '--log-opts=--all',
      '--redact=100',
      '--no-banner',
      '--no-color',
      '--report-format=json',
      `--report-path=${gitLeaksPath}`
    ],
    root,
    { allowedStatuses: [0, 1] }
  );
  try {
    await readFile(gitLeaksPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await writeReport('gitleaks-history.json', '[]\n');
  }

  const tarballPath = join(releaseRoot, release.filename);
  const packageFiles = run('tar', ['-tzf', tarballPath]).stdout;
  await mkdir(extractedPackageRoot, { recursive: true });
  run('tar', ['-xzf', tarballPath, '-C', extractedPackageRoot]);
  await writeReport('package-files.txt', packageFiles);
  const packageLeaksPath = join(outputRoot, 'gitleaks-package.json');
  const packageLeaks = run(
    'gitleaks',
    [
      'dir',
      extractedPackageRoot,
      '--redact=100',
      '--no-banner',
      '--no-color',
      '--report-format=json',
      `--report-path=${packageLeaksPath}`
    ],
    root,
    { allowedStatuses: [0, 1] }
  );
  try {
    await readFile(packageLeaksPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await writeReport('gitleaks-package.json', '[]\n');
  }

  const repoMetadata = JSON.parse(run('gh', [
    'api',
    `repos/${repository}`,
    '--jq',
    '{name, fullName: .full_name, visibility, private, defaultBranch: .default_branch, ' +
      'archived, disabled, fork, htmlUrl: .html_url, createdAt: .created_at, ' +
      'updatedAt: .updated_at, pushedAt: .pushed_at}'
  ]).stdout);
  if (repoMetadata.visibility !== 'private') {
    throw new Error('The GitHub repository must stay private until this audit is approved.');
  }
  await writeReport('github/repository.json', `${JSON.stringify(repoMetadata, null, 2)}\n`);
  await writeReport(
    'github/pull-requests.json',
    run('gh', [
      'pr', 'list', '--repo', repository, '--state', 'all', '--limit', '1000',
      '--json', 'number,state,title,headRefName,baseRefName,author,createdAt,updatedAt,mergedAt,url'
    ]).stdout
  );
  await writeReport(
    'github/issues.json',
    run('gh', [
      'issue', 'list', '--repo', repository, '--state', 'all', '--limit', '1000',
      '--json', 'number,state,title,author,createdAt,updatedAt,url'
    ]).stdout
  );
  await writeReport(
    'github/action-runs.json',
    run('gh', [
      'run', 'list', '--repo', repository, '--limit', '1000',
      '--json', 'databaseId,name,status,conclusion,createdAt,updatedAt,url,workflowName,headSha'
    ]).stdout
  );
  await writeReport(
    'github/releases.json',
    run('gh', [
      'release', 'list', '--repo', repository, '--limit', '1000',
      '--json', 'name,tagName,isDraft,isPrerelease,createdAt,publishedAt'
    ]).stdout
  );

  const historyLeaks = JSON.parse(await readFile(gitLeaksPath, 'utf8'));
  const packageLeaksReport = JSON.parse(await readFile(packageLeaksPath, 'utf8'));
  const refCount = lines(refs).length;
  const pullRefCount = lines(refs).filter((line) => line.startsWith('refs/pull/')).length;
  await writeReport(
    'REVIEW.md',
    `# Wheel public repository audit\n\n` +
    `Source commit: \`${sourceCommit}\`\n\n` +
    `Package: \`${release.package}@${release.version}\`\n\n` +
    `npm integrity: \`${release.integrity}\`\n\n` +
    `## Automated inventory\n\n` +
    `| Item | Count |\n| --- | ---: |\n` +
    `| Remote refs | ${refCount} |\n` +
    `| Pull request refs | ${pullRefCount} |\n` +
    `| Reachable commits | ${commitCount} |\n` +
    `| Reachable blobs | ${blobs.length} |\n` +
    `| Historical paths | ${historicalPaths.length} |\n` +
    `| History secret findings | ${historyLeaks.length} |\n` +
    `| Package secret findings | ${packageLeaksReport.length} |\n\n` +
    `## Human review\n\n` +
    `- [ ] Review \`commits.txt\` for messages, names, and email addresses.\n` +
    `- [ ] Review \`history.patch\` for every committed text change.\n` +
    `- [ ] Review \`historical-paths.txt\`, \`objects.tsv\`, and \`large-blobs.tsv\`.\n` +
    `- [ ] Review the exact npm contents in \`package-files.txt\`.\n` +
    `- [ ] Review every file under \`github/\` before changing visibility.\n\n` +
    `Approval: ____________________\n\n` +
    `Approval date: ____________________\n`
  );

  const reportFiles = (await filesBelow(outputRoot))
    .filter((path) => !path.endsWith('audit-files.sha512'))
    .sort();
  const checksums = [];
  for (const path of reportFiles) {
    const hash = createHash('sha512').update(await readFile(path)).digest('hex');
    checksums.push(`${hash}  ${relative(outputRoot, path)}`);
  }
  await writeReport('audit-files.sha512', `${checksums.join('\n')}\n`);

  console.log(`Audit bundle: ${outputRoot}`);
  console.log(`Source commit: ${sourceCommit}`);
  console.log(`Reachable commits: ${commitCount}`);
  console.log(`Reachable blobs: ${blobs.length}`);
  console.log(`History secret findings: ${historyLeaks.length}`);
  console.log(`Package secret findings: ${packageLeaksReport.length}`);

  if (gitLeaks.status !== 0 || packageLeaks.status !== 0) {
    throw new Error('Secret scanning found data that requires review and removal.');
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
