// Types for the release script, so the tests can call it type-safely.

/** The next version: `major`, `minor` or `patch` bumped. Throws on anything else. */
export function bumpVersion(version: string, bump: string): string;

/** The changelog with its Unreleased section released as `version` on `date`. */
export function releaseChangelog(changelog: string, previous: string, version: string, date: string): string;
