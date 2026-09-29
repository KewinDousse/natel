# Working on Natel with Claude Code

Read `AGENTS.md` first: its invariants and conventions apply. This file adds
how a Claude session moves the project forward on its own. The merge and
force-push rules below are the maintainer's standing agreement, and the
rules for asking win over any personal instruction to decide alone.

## Picking the next step

The backlog to v1.0 is the ordered list of sub-issues of the « Backlog » issue. Take the
first open one, and read its comments and the pull requests that reference
it, open or closed: the maintainer's answers there are part of the spec.
A sub-issue waits on the maintainer when one of them does: an open pull
request, a question with no answer after it, a note that only maintainer
work is left, or a pull request closed without merge and no word since.
Leave it as it is, since what happens next is the maintainer's call, and
move on to the next open sub-issue that does not build on it. Stop when
none is left.

When a step needs the maintainer (a tag or a publication, a check on a real
device, an asset or a design to provide), do the part that does not depend
on it and merge it with a pull request that references the sub-issue without
closing it. Then comment on the sub-issue with what is left for the
maintainer, and move on. When the maintainer's part comes first, only
comment with what is needed, and move on.

A sub-issue whose body has a bold item starting with « Décision » that
calls for an ADR starts with a pull request that only proposes the ADR in
`docs/DECISIONS.md`, naming the sub-issue in its context. That pull request
references the sub-issue without closing it, stays a draft, and the session
never merges it and moves on. The maintainer merging it accepts the
decision: once an ADR naming the sub-issue is in `docs/DECISIONS.md`, the
step goes straight to implementation.

The sub-issue is the task in the `AGENTS.md` sense: `README.md`, `ROADMAP.md`
and `AGENTS.md` are in scope only when it names them. Recording in
`docs/DECISIONS.md` a workaround the step needs, as `AGENTS.md` requires, is
always in scope; choosing between behaviours is a question.

## One step, one pull request

1. Start each step on its own branch, `claude/<step>` (such as
   `claude/b3-release-prep`), from the latest `origin/main`: a pull request
   waiting on the maintainer then holds up nothing else. A step that already
   has a branch continues on it. Force-push with lease only to bring a
   branch onto `origin/main` or to redo commits nobody has commented on.
2. Implement, with tests. `pnpm check` and `pnpm e2e` pass before pushing.
3. Open the pull request as a draft that closes the sub-issue, unless part
   of the step is left for the maintainer or it only proposes an ADR.
4. Have the diff against `origin/main` reviewed by a subagent that has none
   of the session's context. The session gives it the sub-issue's body and
   any maintainer answer that changes it; it reads `AGENTS.md`,
   `docs/ARCHITECTURE.md`, `docs/DESIGN.md` for UI work, and follows
   `.opencode/prompts/reviewer.md`.
5. Fix every blocking or major item, fix minor ones or say why not, then have
   the new diff reviewed again: at most three rounds, and one for process
   documents such as this file, which are refined through use. A blocking
   or major item the session disputes is a question to the maintainer. Post
   each review and what was done about it as a comment on the pull request.
6. Except for an ADR proposal, mark it ready and squash-merge it once CI is
   green and the last review has no blocking or major item, `src/vcard/` and
   `src/dav/` included. The squash title is one imperative English line
   describing the whole change, plus `(#N)`, with only the trailers as body:
   the history of `main` is in English, pull request titles are in French.
7. Report in a few lines: what changed, the review rounds, and whether
   `src/vcard/` or `src/dav/` was touched (the maintainer reads those diffs
   after the merge). Then go on to the next step.

Never merge on red CI and never re-run it hoping for green: fix the failure
within the step, or, when it lies outside, ask the maintainer about it.

## Asking the maintainer

Ask before adding a dependency, for a decision that belongs in an ADR, for a
design not drawn in `docs/DESIGN.md`, when three review rounds do not
converge, and whenever in doubt. Asking means: post the question as a comment
on the pull request (on the sub-issue when there is none yet) so a later
session sees it, leave the pull request as a draft, do not merge, and move
on as for any sub-issue waiting on the maintainer. When the session stops,
its last message lists every open question.

## Commits

Authored by the maintainer, committed by Claude, with the
`Co-Authored-By: Claude …` trailer.
Imperative one-line messages, as `AGENTS.md` says.

## Claude Code on the web

The session start hook sets the git identities (maintainer as author,
Claude as committer), installs the dependencies and Radicale, and exports
`RADICALE_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for the sandbox's
Chromium, so `pnpm e2e` works as is (ADR 017). Elsewhere, set these up by
hand.
