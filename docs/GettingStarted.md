# Getting started

Use this repository as a template, or clone your own copy, then open a terminal at its root. The first goal is to run the starter unchanged so you can see its window, backend, and native examples working together.

## Install the development tools

Install [Bun](https://bun.com/) and Node.js. The current frontend requires Node.js **22.23.4 or newer**; [the frontend manifest](../packages/astro/package.json) is the source of truth when updating the template. Bun manages dependencies and runs the desktop/backend. Astro's CLI also needs Node during development and builds.

```sh
bun install
```

Run installation from the repository root so Bun links all workspace packages together. You do not need to install each package separately.

## Prepare your desktop

Windows needs the Microsoft Edge WebView2 Runtime. If WebUI reports a missing `WebView2Loader.dll`, make that loader available as required by its Windows WebView setup. The native window uses the system WebView.

On Ubuntu, install the WebView runtime and tools used by the starter's native examples:

```sh
sudo apt-get install libwebkit2gtk-4.1-0 libnotify-bin zenity libayatana-appindicator3-1 wl-clipboard xsel xdg-utils libglib2.0-bin
```

Other distributions use their equivalent packages. Run the app in a graphical desktop session: clipboard tools need Wayland or X11, notifications need a notification service, and the tray needs a panel with StatusNotifier/AppIndicator support. [Packaging](Packaging.md#run-on-ubuntu-or-wslg) covers minimal WSLg environments.

Windows and Linux are the current development targets. Some underlying tools also support macOS, but this template's newer native components have not been completed and verified there.

## Open the application

```sh
bun run dev
```

This starts Astro, the native desktop host, and its backend worker. You should see the starter interface with a backend status panel and native feature examples. Closing the window stops the backend and the Astro server started by this command.

WebUI downloads its native library on first use, so the first desktop launch needs network access and a writable library location. Later launches can reuse it.

## Work on the interface in a browser

For layout and content work, you can use:

```sh
bun run dev:web
```

Open [the local frontend](http://127.0.0.1:4321). Application API requests still work. Native window controls and operations such as file pickers require the desktop host, so the examples disable them or report that a desktop connection is needed. Backend push through WebUI also requires the desktop app. Stop browser development with Ctrl+C.

Use desktop development when checking titlebar dragging, transparency, notifications, tray behavior, or native dialogs.

## Make your first changes

Open [the application config](../packages/config/config.ts) and change `APP_NAME`. Restart desktop development so the host and backend pick up the new identity. Then edit [the overview page](../packages/astro/src/pages/index.astro): replace its heading and remove any example panel you no longer need.

Your next stops are [Application identity](AppIdentity.md) for defaults and [App shell](AppShell.md) for the design around every page.

## Useful commands while building an app

| Command | When to use it |
| --- | --- |
| `bun run dev` | Work on the app in its native window. |
| `bun run dev:web` | Work on pages and API features in a browser. |
| `bun run check` | Check TypeScript, Astro, and Vue after changes. |
| `bun run build:frontend` | Produce the static frontend without compiling an executable. |
| `bun run start` | Run the source desktop host against the built frontend. |
| `bun run start:web` | Serve the built frontend and API without a native host. |
| `bun run build --offline` | Create a distributable with WebUI's library staged beside it. |

`start` runs source code using Bun; to try the compiled app, launch the executable in `build/` as described in [Packaging](Packaging.md).

## Ports and a server that is still running

Defaults live in `packages/config/config.ts`. Copy [`.env.example`](../.env.example) to `.env` if this checkout needs different ports. `BACKEND_PORT` defaults to `3000`, `ASTRO_PORT` to `4321`, and WebUI normally chooses a free bridge port.

The root development commands manage Astro in background mode. If an interrupted session leaves it running, inspect or stop it from the repository root:

```sh
bun run astro:astro dev status
bun run astro:astro dev logs
bun run astro:astro dev stop
```

These commands manage Astro; close any remaining desktop window or stop its owning terminal separately. A busy port can also belong to another application, so check before stopping a process.

[Documentation home](README.md) · [Next: application identity](AppIdentity.md)
