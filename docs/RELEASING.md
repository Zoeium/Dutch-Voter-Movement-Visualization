# Releasing

Every release is a [semantic version](https://semver.org/) (`MAJOR.MINOR.PATCH`) with a matching git tag
(`v1.2.0`). Pushing the tag starts the release workflow, which:

1. runs the same checks as CI: lint, type check, code tests, data consistency tests and a build;
2. checks that the tag matches the `version` in `package.json`;
3. publishes the built site to GitHub Pages;
4. creates the GitHub release, with the notes from `CHANGELOG.md` and the site as a zip file.

## One-time setup

In the repository on GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**.

## Making a release

1. Make sure CI is green on `main` and your working tree is clean.
2. In `CHANGELOG.md`, rename the `## [Unreleased]` section to the new version and date, for example
   `## [1.1.0] - 2026-11-15`, add a new empty `## [Unreleased]` above it, and update the links at the bottom.
   Commit this change.
3. Bump the version. This updates `package.json` and `package-lock.json`, commits, and creates the tag:

   ```
   npm version minor    # or: patch, major
   ```

4. Push the commit and the tag:

   ```
   git push --follow-tags
   ```

The release workflow refuses to publish when the tag and `package.json` disagree, or when `CHANGELOG.md` has no section
for the version.

## Which number to bump

- **Major**: a change that breaks how the app or its data files are used, such as a new data layout.
- **Minor**: new features or data, such as a new country, view or election.
- **Patch**: corrections to data or code that change nothing else.
