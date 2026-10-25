# Astro Desktop

A template for building desktop applications with a frameless WebUI window, an Astro interface, and a Bun backend. Use Astro for structure, Vue for interactive components, MDX for content, and Nanostores for shared frontend state.

The app uses the operating system's WebView. You design the window chrome and application layouts yourself, while the template supplies the connections between interface, backend, and native features: file dialogs, notifications, tray menus, clipboard, system paths, and browser events. Choose the application services and database that fit your project.

Windows and Linux are the current support focus. The example screens are a starting point to replace with your own app.

## Install and run

Use this repository as a template or clone your copy. Install [Bun](https://bun.com/) and Node.js **22.23.4 or newer**, then run from the repository root:

```sh
bun install
bun run dev
```

Desktop mode needs WebView2 on Windows or WebKitGTK on Linux. See [Getting started](docs/GettingStarted.md) for platform dependencies and first-run setup. For interface work in a browser, run `bun run dev:web` and open [localhost:4321](http://127.0.0.1:4321).

To begin making it yours, change the name and defaults in [packages/config/config.ts](packages/config/config.ts), then replace the overview and shell design. Build a distributable with `bun run build --offline`; see [Packaging](docs/Packaging.md) for the files to ship.

## Make it your own

Start with the [documentation home](docs/README.md), or jump to the part you want to change:

| Guide | What you can do |
| --- | --- |
| [Getting started](docs/GettingStarted.md) | Install dependencies and run desktop or browser development. |
| [Application identity](docs/AppIdentity.md) | Set your app's name, version, and default settings. |
| [App shell](docs/AppShell.md) | Redesign the chrome, titlebar, sidebar, colors, and window behavior. |
| [Pages and layouts](docs/PagesAndLayouts.md) | Add screens, Vue islands, and MDX documents. |
| [State and data](docs/StateAndData.md) · [Backend](docs/Backend.md) | Connect shared stores to your own APIs and services. |
| [Desktop events](docs/DesktopEvents.md) | Await native operations and push backend changes into the interface. |
| [File dialogs](docs/FileDialogs.md) · [Notifications](docs/Notifications.md) | Let users choose paths and receive native notifications. |
| [System tray](docs/Tray.md) · [Desktop tools](docs/DesktopTools.md) | Add tray actions, clipboard operations, folder lookup, and shell integration. |
| [Packaging](docs/Packaging.md) · [CI and releases](docs/CI.md) | Build, test, and download Windows/Linux packages. |

---

Contributing to the template? See [Contributing](docs/Contributing.md) for conventions, checks, native tests, and development server management.
