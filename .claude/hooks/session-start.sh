#!/bin/bash
# Prepares a Claude Code on the web session: dependencies for `pnpm check`
# and `pnpm e2e`, and a git identity so commits are authored by the
# maintainer, with Claude as committer and in the Co-Authored-By trailer.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# Author is the maintainer; the committer stays Claude, which the web
# environment requires for its commits.
git config author.name "Kewin Dousse"
git config author.email "me@kewindousse.ch"
git config user.name "Claude"
git config user.email "noreply@anthropic.com"

# stdout of a SessionStart hook lands in the session context; keep it quiet.
pnpm install --frozen-lockfile >&2

# e2e: Radicale and Xandikos in a venv outside the repo, and the sandbox's
# preinstalled Chromium, since the browser build matching Playwright cannot
# be downloaded. Baïkal runs from Docker, which the sandbox does not start.
venv="$HOME/.cache/natel-e2e"
[ -x "$venv/bin/pip" ] || python3 -m venv "$venv" >&2
# Offline-safe on a warm container: pip only runs when the pins changed.
if ! cmp -s tests/e2e/requirements.txt "$venv/requirements.txt"; then
  "$venv/bin/pip" install --quiet -r tests/e2e/requirements.txt >&2
  cp tests/e2e/requirements.txt "$venv/requirements.txt"
fi
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export RADICALE_BIN=$venv/bin/radicale" >> "$CLAUDE_ENV_FILE"
  echo "export XANDIKOS_BIN=$venv/bin/xandikos" >> "$CLAUDE_ENV_FILE"
  if [ -x /opt/pw-browsers/chromium ]; then
    echo "export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium" >> "$CLAUDE_ENV_FILE"
  fi
fi
