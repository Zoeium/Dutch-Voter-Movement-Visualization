#!/usr/bin/env bash
# Manage the gh-pages branch that GitHub Pages serves:
#   /                   the latest release
#   /preview/<branch>/  a temporary preview of a branch, with a .deployed-at timestamp
#
# Usage (from a checkout of the repository, in CI):
#   scripts/pages.sh release <build dir>          publish a release at the root, keeping previews
#   scripts/pages.sh preview <slug> <build dir>   publish or refresh one preview
#   scripts/pages.sh remove <slug>                remove one preview
#   scripts/pages.sh prune <days>                 remove previews not refreshed for <days> days
#   scripts/pages.sh slug <branch name>           print the preview folder name for a branch
set -euo pipefail

BRANCH=gh-pages
SITE_DIR=.pages-site

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
  # Serve files as they are (no Jekyll), and keep search engines away from previews.
  touch "$SITE_DIR/.nojekyll"
  printf 'User-agent: *\nDisallow: /preview/\n' > "$SITE_DIR/robots.txt"
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
    find "$SITE_DIR" -mindepth 1 -maxdepth 1 ! -name .git ! -name preview ! -name .nojekyll ! -name robots.txt -exec rm -rf {} +
    cp -R "$build_dir"/. "$SITE_DIR"/
    commit_and_push "Release ${GITHUB_REF_NAME:-site}"
    ;;
  preview)
    name=$2 build_dir=$3
    checkout_site
    rm -rf "${SITE_DIR:?}/preview/$name"
    mkdir -p "$SITE_DIR/preview/$name"
    cp -R "$build_dir"/. "$SITE_DIR/preview/$name"/
    date +%s > "$SITE_DIR/preview/$name/.deployed-at"
    commit_and_push "Preview $name"
    ;;
  remove)
    name=$2
    checkout_site
    rm -rf "${SITE_DIR:?}/preview/$name"
    commit_and_push "Remove preview $name"
    ;;
  prune)
    days=$2
    checkout_site
    now=$(date +%s)
    for dir in "$SITE_DIR"/preview/*/; do
      [ -d "$dir" ] || continue
      deployed=$(cat "$dir/.deployed-at" 2>/dev/null || echo 0)
      if [ $(( now - deployed )) -gt $(( days * 86400 )) ]; then
        echo "Removing expired preview $(basename "$dir")"
        rm -rf "$dir"
      fi
    done
    commit_and_push "Remove previews older than $days days"
    ;;
  slug)
    slug "$2"
    ;;
  *)
    sed -n '2,12p' "$0"
    exit 1
    ;;
esac
