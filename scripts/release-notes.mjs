// Print the CHANGELOG.md section of one version, for the GitHub release notes.
// Usage: node scripts/release-notes.mjs 1.2.0
// Fails when the version has no section, so a release cannot go out undocumented.
import {readFileSync} from 'node:fs';

const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/release-notes.mjs <version>');
  process.exit(1);
}

const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const lines = changelog.split(/\r?\n/);
const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
if (start < 0) {
  console.error(`CHANGELOG.md has no "## [${version}]" section. Add one before releasing.`);
  process.exit(1);
}
const end = lines.findIndex((line, index) => index > start && line.startsWith('## ['));
const notes = lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
if (!notes) {
  console.error(`The CHANGELOG.md section for ${version} is empty.`);
  process.exit(1);
}
console.log(notes);
