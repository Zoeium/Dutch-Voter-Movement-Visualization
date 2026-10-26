#!/usr/bin/env bash
# Manage the gh-pages branch that GitHub Pages serves:
#   /                 the main site: the latest release
#   /test/<branch>/   a test site per branch, with .deployed-at (Unix time) and
#                     .deployed-branch files; removed after a period without deployments
#
# Usage (from a checkout of the repository, in CI):
#   scripts/pages.sh release <build dir>          publish a release at the root, keeping test sites
#   scripts/pages.sh test <branch> <build dir>    publish or replace the test site of a branch
#   scripts/pages.sh remove-test <branch>         remove the test site of a branch
#   scripts/pages.sh prune <days>                 remove test sites not deployed for <days> days
#   scripts/pages.sh slug <branch>                print the folder name used for a branch
set -euo pipefail

BRANCH=gh-pages
SITE_DIR=.pages-site
TEST_DIR=test

slug() {
  # Lowercase, every run of other characters becomes one dash: feature/Phone_UI -> feature-phone-ui
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -e 's/[^a-z0-9]\{1,\}/-/g' -e 's/^-//' -e 's/-$//'
}

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
  # Earlier layouts: /preview/<branch>/, and a single shared site directly in /test/.
  rm -rf "$SITE_DIR/preview"
  if [ -f "$SITE_DIR/$TEST_DIR/.deployed-branch" ]; then
    rm -rf "${SITE_DIR:?}/$TEST_DIR"
  fi
  # Serve files as they are (no Jekyll), and keep search engines away from test sites.
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
    target="$SITE_DIR/$TEST_DIR/$(slug "$branch")"
    checkout_site
    rm -rf "$target"
    mkdir -p "$target"
    cp -R "$build_dir"/. "$target"/
    date +%s > "$target/.deployed-at"
    printf '%s\n' "$branch" > "$target/.deployed-branch"
    commit_and_push "Test site: $branch"
    ;;
  remove-test)
    branch=$2
    checkout_site
    rm -rf "${SITE_DIR:?}/$TEST_DIR/$(slug "$branch")"
    commit_and_push "Remove test site of deleted branch $branch"
    ;;
  prune)
    days=$2
    checkout_site
    now=$(date +%s)
    for dir in "$SITE_DIR/$TEST_DIR"/*/; do
      [ -d "$dir" ] || continue
      deployed=$(cat "$dir/.deployed-at" 2>/dev/null || echo 0)
      if [ $(( now - deployed )) -gt $(( days * 86400 )) ]; then
        echo "Removing test site $(basename "$dir"): not deployed for more than $days days."
        rm -rf "$dir"
      fi
    done
    commit_and_push "Remove test sites not deployed for $days days"
    ;;
  slug)
    slug "$2"
    ;;
  *)
    sed -n '2,14p' "$0"
    exit 1
    ;;
esac
