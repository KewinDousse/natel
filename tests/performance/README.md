# Address book opening benchmark

Use the Node version, pnpm version and Python environment in
[CONTRIBUTING.md](../../CONTRIBUTING.md#checks). Install dependencies with
`pnpm install --frozen-lockfile` and Chromium with `pnpm exec playwright install chromium`.
Activate the Python environment or set `RADICALE_BIN` to its executable.
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select a preinstalled Chromium.

```sh
pnpm perf:books
pnpm perf:books --grep 'with 1000 contacts'
pnpm exec playwright show-report playwright-report/performance
```

Run on an otherwise idle machine. The command starts a throwaway Radicale on
loopback port 5399 and serves the production build on port 4499; both must be free.
Storage is isolated from the e2e suite and removed on shutdown. Run builds and
benchmarks separately in this worktree.

## Workload and timing

Separate tests open books of 100, 300, 1,000, 3,000 and 10,000 contacts, roughly
tripling each time. Deterministic synthetic vCards contain names spread over A–Z,
a company, phone, email, address and note. Photos and group cards are excluded.
Radicale's collection import (PUT of concatenated vCards to a new collection,
then PROPPATCH for its name) prepares each book outside the timed path.

Each size discards one warm-up and records five openings. Every opening uses a
fresh browser context with empty HTTP and TanStack Query caches. The server and
OS can retain caches after the warm-up. Chromium runs at 1280 × 720 without
throttling, trace, screenshots or video.

Timing starts in the capture handler of the menu click selecting the book and
stops on the second animation frame after the counter shows the expected count
and the first rows exist with a height, allowing a paint opportunity. This includes
CardDAV listing/fetching, parsing, sorting, rendering and layout, and excludes
sign-in, discovery, application startup and fixture preparation.

## Comparing a pull request

To compare `main` with an open, mergeable pull request based on it, choose **Run
workflow** on the **Performance comparison** workflow in the Actions tab and enter
the pull request's number. It measures both on the same machine with the pull
request's benchmark, against the pull request merged into `main`. The run's summary
and one comment on the pull request, updated by each run, show the medians, their
difference, any timeout and the raw samples. Differences are informational and
block nothing.

Run it only on a pull request whose code you trust. A run from `main` gives that
code access to `main`'s Actions cache, which CI and releases read, as well as to the
reported figures, and `permissions` cannot remove that access.

## Results and limits

The console prints each opening and a completed size's median. Each test attaches
`book-opening-<size>.json` to the Playwright report: samples, median, range,
completion status, any failure, timestamp, revision, browser, OS, CPU and Node.
Partial samples survive a failure; statistics stay null unless the size completed.

An opening attempt has a two-minute limit, including page setup. A timeout or
incomplete list fails that size. There is no regression budget and the command is
outside CI and `pnpm check`. Compare repeated runs on the same machine and
versions, copying `playwright-report/performance` between them since each run
replaces it. These local desktop results do not predict remote latency, mobile
hardware or reopening a book already cached by Natel.
