# Automated tests, builds, and releases

The template's [GitHub Actions workflow](../.github/workflows/ci.yml) runs for pushes to `main` and `develop`, pull requests targeting either branch, and manual runs. It uses Windows x64 and Ubuntu Linux x64 runners. Bun is pinned in the workflow; Node 24 supplies Astro's build tooling.

## What each run checks

Both platforms install the committed lockfile, check TypeScript/Astro/Vue, and run unit and worker tests. Browser integration uses Chromium on Linux and the runner's installed Microsoft Edge on Windows. Package jobs then compile offline builds and exercise a relocated native WebView package before creating download archives.

Linux runs its native checks inside Xvfb with the private D-Bus tray host and notification fixture. This checks the actual GTK/WebUI bridge and native menu callback without needing a desktop panel on the runner. Windows ensures the WebView2 Runtime is installed, then runs its native package check directly. Native smoke checks do not require a user to choose a file or click a toast.

Failed browser runs upload diagnostic files when present. A failed check or package job prevents release publication.

On a fresh Windows runner, a WebView initialization failure before the app is ready gets one process restart with the same empty `PATH` and offline settings. Smoke assertion failures are not retried, and a second startup failure fails the job.

The browser/native smoke tests exercise the starter screens. When replacing those screens in your own app, update their selectors and scenarios alongside the interface.

## Download a build

Open the repository's **Actions** tab, select a run, and download a `package-bun-windows-x64` or `package-bun-linux-x64` artifact. Each contains a portable ZIP or tarball and its SHA-256 checksum. The package includes its selected target's native helpers and libraries, including license notices. Extract the complete archive; do not move just the executable out of it.

PR artifacts are available for review for 14 days. They do not create releases or use release write permissions. Fork PRs follow the same rule, though GitHub may require a maintainer to approve their first workflow run.

## Branch release channels

After all checks and both package jobs succeed:

| Source | Result |
| --- | --- |
| Push to `main` | A normal release, marked Latest, with Windows/Linux archives and `SHA256SUMS.txt`. |
| Push to `develop` | A testing prerelease with the same assets; does not replace Latest. |
| Pull request | Workflow artifacts only. |
| Manual run on `main` or `develop` | Publishes through that branch's channel after the same checks. |
| Manual run on another branch | Checks and artifacts only. |

Tags use `build-<run-number>-<commit>` for main and `testing-<run-number>-<commit>` for develop. Each release points to the tested commit. App name/version in its title come from your [application config](AppIdentity.md), so release automation also works when you rename the template. The run number distinguishes multiple builds of the same app version; it does not edit that version for you.

Publication verifies archive checksums, uploads to a draft, and publishes only after the files are attached. Rerunning a successfully published run keeps that release intact; rerunning an interrupted draft can finish its upload. A newer run on the same branch cancels an older in-progress run.

## Adapt it for your own project

After creating your app from the template, check that GitHub Actions is enabled in the new repository. Publication uses the job's `GITHUB_TOKEN` with `contents: write`; a personal access token is not required. Other jobs have read-only repository permissions. Your organization can restrict these settings, so check its Actions policy if release creation is denied.

Change the branch filters and release condition together if you use different branch names. Keep platform dependencies aligned with the native components your app retains. To change Bun, update `BUN_VERSION` and verify both target builds. The action versions are pinned to commits with version comments beside them.

For a local archive after building an offline target:

```sh
bun run build --target=bun-windows-x64 --offline
bun scripts/package-release.ts --target=bun-windows-x64
```

Use `bun-linux-x64` for the Linux equivalent. Archives land in `build/releases/`. [Packaging](Packaging.md) describes runtime requirements; [Contributing](Contributing.md) lists local checks.

[Documentation home](README.md) · [Packaging](Packaging.md)
