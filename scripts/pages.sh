#!/usr/bin/env bash
# Manage the gh-pages branch that GitHub Pages serves:
#   /        the main site: the latest release
#   /test/   the test site: the most recently pushed branch, with .deployed-at (Unix time)
#            and .deployed-branch files; removed after a period without deployments
#
# Usage (from a checkout of the repository, in CI):
#   scripts/pages.sh release <build dir>          publish a release at the root, keeping the test site
#   scripts/pages.sh test <branch> <build dir>    publish a branch as the test site
#   scripts/pages.sh remove-test <branch>         remove the test site if it shows <branch>
#   scripts/pages.sh prune <days>                 remove the test site if not deployed for <days> days
set -euo pipefail

BRANCH=gh-pages
SITE_DIR=.pages-site
TEST_DIR=test

checkout_site() {
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  rm -rf "$SITE_DIR"
  git worktree prune
  if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null; then
    git fetch --depth=1 origin "$BRANCH"
    git worktree add -B "$BRANCH" "$SITE_DIR" "origin/$BRANCH"
  else
    # First publish: start an empty branch with no history from the code branches.
    git worktree add --detach "$SITE_DIR"
    (cd "$SITE_DIR" && git checkout --orphan "$BRANCH" && git rm -rf --quiet .)
  fi
  # Earlier versions published one preview per branch; the test site replaces them.
  rm -rf "$SITE_DIR/preview"
  # Serve files as they are (no Jekyll), and keep search engines away from the test site.
  touch "$SITE_DIR/.nojekyll"
  printf 'User-agent: *\nDisallow: /%s/\n' "$TEST_DIR" > "$SITE_DIR/robots.txt"
}

commit_and_push() {
  (
    cd "$SITE_DIR"
    git add -A
    if git diff --cached --quiet; then
      echo 'gh-pages is already up to date.'
    else
      git commit --quiet -m "$1"
      git push --quiet origin "$BRANCH"
    fi
  )
  git worktree remove --force "$SITE_DIR"
}

case "${1:-}" in
  release)
    build_dir=$2
    checkout_site
    find "$SITE_DIR" -mindepth 1 -maxdepth 1 ! -name .git ! -name "$TEST_DIR" ! -name .nojekyll ! -name robots.txt -exec rm -rf {} +
    cp -R "$build_dir"/. "$SITE_DIR"/
    commit_and_push "Release ${GITHUB_REF_NAME:-site}"
    ;;
  test)
    branch=$2 build_dir=$3
    checkout_site
    rm -rf "${SITE_DIR:?}/$TEST_DIR"
    mkdir -p "$SITE_DIR/$TEST_DIR"
    cp -R "$build_dir"/. "$SITE_DIR/$TEST_DIR"/
    date +%s > "$SITE_DIR/$TEST_DIR/.deployed-at"
    printf '%s\n' "$branch" > "$SITE_DIR/$TEST_DIR/.deployed-branch"
    commit_and_push "Test site: $branch"
    ;;
  remove-test)
    branch=$2
    checkout_site
    if [ "$(cat "$SITE_DIR/$TEST_DIR/.deployed-branch" 2>/dev/null || true)" = "$branch" ]; then
      echo "The test site shows deleted branch $branch: removing it."
      rm -rf "${SITE_DIR:?}/$TEST_DIR"
    else
      echo "The test site does not show $branch: keeping it."
    fi
    commit_and_push "Remove test site of deleted branch $branch"
    ;;
  prune)
    days=$2
    checkout_site
    deployed=$(cat "$SITE_DIR/$TEST_DIR/.deployed-at" 2>/dev/null || echo 0)
    if [ -d "$SITE_DIR/$TEST_DIR" ] && [ $(( $(date +%s) - deployed )) -gt $(( days * 86400 )) ]; then
      echo "The test site was not deployed for more than $days days: removing it."
      rm -rf "${SITE_DIR:?}/$TEST_DIR"
    fi
    commit_and_push "Remove test site after $days days without deployments"
    ;;
  *)
    sed -n '2,13p' "$0"
    exit 1
    ;;
esac
