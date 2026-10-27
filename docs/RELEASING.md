# Releasing

Every release is a [semantic version](https://semver.org/) (`MAJOR.MINOR.PATCH`) with a matching git tag
(`v1.2.0`). Pushing the tag starts the release workflow, which:

1. runs the same checks as CI: lint, type check, code tests, data consistency tests and a build;
2. checks that the tag matches the `version` in `package.json`;
3. publishes the built site to GitHub Pages;
4. creates the GitHub release, with the notes from `CHANGELOG.md` and the site as a zip file.

## One-time setup

1. In **Settings → Pages**, set **Source** to **GitHub Actions**.
2. In **Settings → Environments → github-pages → Deployment branches and tags**, add a rule of type **Tag** with
   the pattern `v*`. GitHub only lets the default branch deploy to Pages until version tags are allowed there.

## Making a release

1. Make sure CI is green on `main`, your working tree is clean, and the `## [Unreleased]` section of `CHANGELOG.md`
   describes everything in the release.
2. Run the release script with the kind of release (see below):

   ```
   npm run release:minor    # or: release:patch, release:major
   ```

   It works out the new version from `package.json` (1.0.0 becomes 1.1.0 for a minor release), then:
   - renames the Unreleased section of `CHANGELOG.md` to the new version with today's date, adds a new empty
     Unreleased section above it, and updates the links at the bottom;
   - sets the version in `package.json` and `package-lock.json`;
   - commits this as `Release v1.1.0` and creates the tag `v1.1.0`.

   It refuses to run on a branch other than `main` (unless you add `--any-branch`:
   `npm run release -- minor --any-branch`), with uncommitted changes, with an empty Unreleased section, or when the
   tag already exists. To undo it before pushing, delete the tag and the commit, as the script prints.
3. Check the commit, then push it and the tag:

   ```
   git push --follow-tags
   ```

The release workflow refuses to publish when the tag and `package.json` disagree, or when `CHANGELOG.md` has no section
for the version.

## Which number to bump

- **Major**: a change that breaks how the app or its data files are used, such as a new data layout.
- **Minor**: new features or data, such as a new country, view or election.
- **Patch**: corrections to data or code that change nothing else.
