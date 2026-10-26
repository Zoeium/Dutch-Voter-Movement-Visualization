# Releasing

Every release is a [semantic version](https://semver.org/) (`MAJOR.MINOR.PATCH`) with a matching git tag
(`v1.2.0`). Pushing the tag starts the release workflow, which:

1. runs the same checks as CI: lint, type check, code tests, data consistency tests and a build;
2. checks that the tag matches the `version` in `package.json`;
3. publishes the built site at the root of the `gh-pages` branch, which GitHub Pages serves;
4. creates the GitHub release, with the notes from `CHANGELOG.md` and the site as a zip file.

## Main site and test site

| Site      | Address                                                             | Shows                                   |
|-----------|---------------------------------------------------------------------|-----------------------------------------|
| Main site | `https://zoeium.github.io/Dutch-Voter-Movement-Visualization/`      | The latest release                      |
| Test site | `https://zoeium.github.io/Dutch-Voter-Movement-Visualization/test/` | The most recently pushed branch         |

- Every push to a branch (`main` included) whose checks pass replaces the test site. The footer shows the branch and
  commit next to the version number.
- The test site is removed when the branch it shows is deleted, for example when its pull request is merged.
- A daily cleanup removes the test site when nothing has been deployed to it for 14 days (`TEST_SITE_DAYS` in
  `.github/workflows/test-site-cleanup.yml`). The cleanup can also be started by hand from the Actions tab.

The test site never changes the main site. Search engines are asked to skip it (`robots.txt`).

## One-time setup

1. Let the `gh-pages` branch be created: push any branch. When its checks pass, the CI workflow publishes the
   test site and creates the branch.
2. In **Settings → Pages**, set **Source** to **Deploy from a branch**, with branch `gh-pages` and folder `/ (root)`.
3. In **Settings → Environments → github-pages → Deployment branches and tags**, add the branch `gh-pages`. GitHub
   publishes the site from that branch, and the environment rules decide which branches may do so.

The test site is deployed by the branch's own CI run, so it works before anything is merged. Removal after a branch is
deleted and the daily cleanup only run once `test-site-cleanup.yml` is on `main`: GitHub runs those triggers from the
default branch.

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
