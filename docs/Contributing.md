# Contributing to the template

These notes are for changes to the reusable template itself. If you are making an application from it, start with [Getting started](GettingStarted.md) and use whichever parts help your app.

## Keep the starting point approachable

Application identity and defaults stay as plain, easily editable constants and objects in `packages/config/config.ts`. Build overrides belong in the build tooling. Keep common native components self-contained in their `native_*.ts` files, with one default object exposing `register(...): void` and useful helpers. Register them once at startup; do not add a component-unloading lifecycle without a concrete use case.

Shared frontend state belongs in Nanostores, with HTTP actions in store modules and native window settings in AppSettings. Use Astro for normal structure, Vue when interactivity benefits from it, and MDX for content. Preserve the workspace wildcard exports so adding shared modules does not require a per-file export list.

Windows and Linux are the current support focus. When a provider has different capabilities or system dependencies, document those differences and handle them in the example UI. Mac-specific work needs its own implementation and verification before being presented as supported.

## Run the appropriate checks

Use commands from the repository root:

| Command | What it checks |
| --- | --- |
| `bun run check` | Bun TypeScript plus Astro/Vue diagnostics. |
| `bun run test` | Worker RPC, backend, native request/dispatch boundaries, config, and window/component contracts. |
| `bun run test:e2e` | Built frontend, HTTP actions, store updates, navigation, and a mocked native bridge in Playwright. |
| `bun run test:native` | Built frontend in a real source-mode native WebView. |
| `bun run test:dev` | Native WebView against Astro development mode, including owned-server cleanup. |
| `bun run test:package` | Relocated host executable, embedded frontend/worker, native assets, and first-run WebUI download. |
| `bun run test:package --offline` | Relocated host package with runtime external downloads blocked. |

Install Playwright's browser with `bunx playwright install chromium`, or select an installed one using `PLAYWRIGHT_CHANNEL`. In PowerShell, for example:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
bun run test:e2e
```

Native tests require a graphical session and the host WebView/runtime tools. They open and close a test window and may send a real notification. Normal smoke checks read the clipboard without replacing it and load the file-dialog library without opening an unattended picker. Check user-driven dialog selection separately when changing that feature.

Use tests relevant to the change. Documentation-only work should verify examples, paths, and links rather than launch every native integration test.

## Automated verification

The [CI workflow](CI.md) runs checks and native package tests on Windows/Linux for branch pushes and PRs, then publishes the appropriate branch release after success.

## Test tray menu delivery on Linux

The Linux tray fixture creates a private D-Bus watcher and notification service, launches the compiled app, and invokes its exported native menu item. It can test menu delivery on WSLg without claiming the real desktop's tray host:

```sh
sudo apt-get install python3-dbus python3-gi dbus-x11 dunst
python3 tests/fixtures/linux-tray-host.py ./build/astro-desktop-linux-x64
```

This still requires a graphical session and normal application libraries. It verifies delivery, not how a particular desktop panel renders the icon. For a manual menu check, set `NATIVE_TRAY_TEST=1` before running a native smoke test and select its temporary "Native tray integration check" item promptly.

## Development server ownership

Follow [the frontend instructions](../packages/astro/AGENTS.md) when starting Astro directly: use `astro dev --background`, then its `status`, `logs`, and `stop` commands. The root development scripts already do this and stop only the server they started. Keep that ownership behavior when changing the scripts.

## Packaging details worth preserving

The backend worker and frontend are embedded, while OS-loaded libraries and executable helpers are staged as real target-specific files. Build and runtime paths must work outside the source tree and from an unrelated working directory. The package test checks this in a temporary path containing spaces; Windows uses an empty `PATH`, while Linux keeps its system desktop tools available.

The compile-only WebUI resolver adjustment in `build.ts` uses `process.execPath` in place of the upstream `process.argv[0]` fallback. Source development uses the unmodified provider. The file-dialog declaration bridge in `packages/desktop/types` points at the declarations actually shipped by its provider. Recheck whether these adjustments are still needed when updating those dependencies.

Keep [the consumer guides](README.md) aligned with working examples. Document a feature where someone using the template will look for it, and keep the repository README as an introduction and guide map.
