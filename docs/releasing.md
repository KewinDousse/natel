# Releasing

This page is for the maintainer. Contributors only add change notes, as
[CONTRIBUTING.md](../CONTRIBUTING.md#changelog) describes.

## Release notes

The Release action assembles fragments and existing `Unreleased` entries, removes
consumed files and updates `CHANGELOG.md` in its frozen candidate. Review the wording,
group related entries and remove duplication before starting the action. Reject its
approval if the summary needs editing; changed notes require a new candidate. Each release
has a version and a `YYYY-MM-DD` date, newest first, with no empty categories.
Published notes stay stable; factual corrections must be explicit. GitHub Releases
reuse the validated notes, with documentation links pointing to the release tag.

## Running a release

Run **Release** on `main` with the exact version, without `v`, such as `0.4.0`
or `0.4.0-rc.1`. Only `KewinDousse` may start or rerun this workflow. Every
publication job checks both the original actor and the actor requesting a rerun.

The action assembles the notes, version and Docker references into a local commit.
Its summary shows the exact commit, source, channel, release notes and intended
aliases. A Git bundle preserves that candidate within the run, and CI tests that
same commit, including the built image. After green checks, approve the `release`
environment in **Review deployments**. The action fast-forwards `main` to the
release commit, creates its immutable tag, publishes the tested
image and attestation, records the GitHub Release, then promotes aliases and the
stable demo with `version.json`. No release PR or second manual action is needed.

Rejecting approval leaves remote source, tags and releases untouched. If `main`
advances, publication refuses to overwrite it. Review and release
the updated source in a new run. Approval and artifact retention are separate:
complete approval within seven days or start a new run to regenerate and review
the candidate. A failed publication resumes while `main` still points to
the preparation base or the exact candidate.

Rerun a failed job or start **Release** with the same version to resume a prepared
tag. Existing tags, release notes and image versions are never overwritten;
existing images must have the approved source revision. Every attempt rechecks
promotion against current releases. Prereleases change no stable aliases or demo;
maintenance releases cannot move `latest`, their minor alias or the manifest
backwards. A historical tag without valid preparation metadata is refused.

## Repository setup

Done once, before the first release.

### Changelog decision check

Configure the **Changelog decision** check as a required check on `main`,
applying it to administrators too; creating the workflow alone does not enforce it.

### Release approval environment

Configure the `release` environment with `KewinDousse` as its sole required
reviewer, self-approval allowed, administrator bypass disabled, and a single branch
policy permitting `main`. Native required reviewers are available on the public
repository under the current GitHub plan. The workflow refuses to prepare or
publish when those protections are missing or broader than specified.

### Release identity

Install the dedicated release GitHub App on **only** `KewinDousse/natel`, with
repository Contents read/write. Store its Client ID as `RELEASE_APP_CLIENT_ID`
and its private key as `RELEASE_APP_PRIVATE_KEY` in the **release
environment**, so they are available only after approval. The official token
action scopes its short-lived token to this repository and revokes it
afterwards. No personal token or pull-request write permission is
needed, and Actions does not need permission to create or approve PRs.

Permit the App to fast-forward `main` to the release commit.
On `main`, separate the PR/status-check requirements, where the App needs a
bypass, from deletion and non-fast-forward protection, which must not exempt it.
The workflow checks the branch head before writing and pushes without force.
Its approved candidate has already passed the complete reusable CI workflow.

Keep tag creation separate too: an active creation-only ruleset for `refs/tags/v*`
permits administrators and this App. Update/deletion protection does not exempt the
App. Create each additional restriction before changing an existing combined
ruleset, so protection stays continuous. Repository settings are configured
separately; the release workflow does not change its own protections.
