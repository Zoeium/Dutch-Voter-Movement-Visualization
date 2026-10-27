import {describe, expect, it} from 'vitest';
// @ts-expect-error -- plain JavaScript release script without type declarations
import {bumpVersion, releaseChangelog} from '../../../scripts/release.mjs';

const URL = 'https://github.com/Zoeium/Dutch-Voter-Movement-Visualization';

describe('bumpVersion', () => {
  it.each([
    ['1.2.3', 'major', '2.0.0'],
    ['1.2.3', 'minor', '1.3.0'],
    ['1.2.3', 'patch', '1.2.4'],
  ])('%s with a %s release becomes %s', (version, bump, expected) => {
    expect(bumpVersion(version, bump)).toBe(expected);
  });

  it('rejects unknown release types and versions', () => {
    expect(() => bumpVersion('1.2.3', 'huge')).toThrow();
    expect(() => bumpVersion('1.2', 'minor')).toThrow();
  });
});

describe('releaseChangelog', () => {
  const changelog = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '- A thing.',
    '',
    '## [1.0.0] - 2026-10-26',
    '',
    'Initial release',
    '',
    `[Unreleased]: ${URL}/compare/v1.0.0...HEAD`,
    `[1.0.0]: ${URL}/releases/tag/v1.0.0`,
    '',
  ].join('\n');

  it('dates the Unreleased section, opens a new one and updates the links', () => {
    expect(releaseChangelog(changelog, '1.0.0', '1.1.0', '2026-11-15')).toBe([
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '## [1.1.0] - 2026-11-15',
      '',
      '### Added',
      '',
      '- A thing.',
      '',
      '## [1.0.0] - 2026-10-26',
      '',
      'Initial release',
      '',
      `[Unreleased]: ${URL}/compare/v1.1.0...HEAD`,
      `[1.1.0]: ${URL}/compare/v1.0.0...v1.1.0`,
      `[1.0.0]: ${URL}/releases/tag/v1.0.0`,
      '',
    ].join('\n'));
  });

  it('keeps Windows line endings', () => {
    const released = releaseChangelog(changelog.replace(/\n/g, '\r\n'), '1.0.0', '1.1.0', '2026-11-15');
    expect(released.split('\r\n')).toContain('## [1.1.0] - 2026-11-15');
    expect(released.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('refuses to release an empty Unreleased section', () => {
    const empty = changelog.replace('### Added\n\n- A thing.\n', '');
    expect(() => releaseChangelog(empty, '1.0.0', '1.1.0', '2026-11-15')).toThrow(/empty/);
  });
});
