#!/bin/bash
# Prepares a Claude Code on the web session: dependencies for `pnpm check`,
# and a git identity so commits are authored by the maintainer, with Claude
# credited through the Co-Authored-By trailer.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

git config user.name "Kewin Dousse"
git config user.email "me@kewindousse.ch"

# stdout of a SessionStart hook lands in the session context; keep it quiet.
pnpm install --frozen-lockfile >&2
