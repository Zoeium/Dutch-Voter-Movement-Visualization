// Prepare a release: bump the version, date the changelog, commit and tag.
// Usage: npm run release -- <major|minor|patch> [--any-branch]
// Pushing the commit and tag afterwards (git push --follow-tags) starts the release workflow.
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const BUMPS = ['major', 'minor', 'patch'];
const REPO_URL = 'https://github.com/Zoeium/Dutch-Voter-Movement-Visualization';

/** The next semantic version: `bumpVersion('1.2.3', 'minor')` is `1.3.0`. */
export function bumpVersion(version, bump) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`"${version}" is not a MAJOR.MINOR.PATCH version`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown release type "${bump}": use ${BUMPS.join(', ')}`);
}

/**
 * Turn the changelog's Unreleased section into the section of `version`, dated `date`,
 * with a new empty Unreleased section above it and the comparison links updated.
 */
export function releaseChangelog(changelog, previous, version, date) {
  const eol = changelog.includes('\r\n') ? '\r\n' : '\n';
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith('## [Unreleased]'));
  if (start < 0) throw new Error('CHANGELOG.md has no "## [Unreleased]" section');
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## ['));
  const body = lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
  if (!body) throw new Error('The Unreleased section of CHANGELOG.md is empty: nothing to release');

  lines.splice(start, 1, '## [Unreleased]', '', `## [${version}] - ${date}`);

  const linkIndex = lines.findIndex((line) => line.startsWith('[Unreleased]:'));
  const newLinks = [
    `[Unreleased]: ${REPO_URL}/compare/v${version}...HEAD`,
    `[${version}]: ${REPO_URL}/compare/v${previous}...v${version}`,
  ];
  if (linkIndex < 0) lines.push(...newLinks);
  else lines.splice(linkIndex, 1, ...newLinks);

  return lines.join(eol);
}

function git(...args) {
  return execFileSync('git', args, {encoding: 'utf8'}).trim();
}

/** Write a JSON file in npm's format: two-space indent and a final newline. */
function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function main() {
  const args = process.argv.slice(2);
  const bump = args.find((arg) => !arg.startsWith('--'));
  if (!BUMPS.includes(bump)) {
    console.error(`Usage: npm run release -- <${BUMPS.join('|')}> [--any-branch]`);
    process.exit(1);
  }

  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch !== 'main' && !args.includes('--any-branch')) {
    console.error(`Releases are made from main, not "${branch}". Pass --any-branch to release from here anyway.`);
    process.exit(1);
  }
  if (git('status', '--porcelain')) {
    console.error('The working tree has uncommitted changes. Commit or stash them first.');
    process.exit(1);
  }

  const root = new URL('../', import.meta.url);
  const packagePath = new URL('package.json', root);
  const lockPath = new URL('package-lock.json', root);
  const changelogPath = new URL('CHANGELOG.md', root);

  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  const previous = pkg.version;
  const version = bumpVersion(previous, bump);
  const tag = `v${version}`;
  if (git('tag', '--list', tag)) {
    console.error(`Tag ${tag} already exists.`);
    process.exit(1);
  }

  const date = new Date().toISOString().slice(0, 10);
  try {
    writeFileSync(changelogPath, releaseChangelog(readFileSync(changelogPath, 'utf8'), previous, version, date));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  pkg.version = version;
  writeJson(packagePath, pkg);
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  writeJson(lockPath, lock);

  git('add', 'CHANGELOG.md', 'package.json', 'package-lock.json');
  git('commit', '-m', `Release ${tag}`);
  git('tag', '-a', tag, '-m', `Release ${tag}`);

  console.log(`Prepared ${tag} (${bump} release after v${previous}): committed and tagged.`);
  console.log('Check the commit, then publish it with:\n\n  git push --follow-tags\n');
  console.log(`To undo before pushing: git tag -d ${tag} && git reset --hard HEAD~1`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
