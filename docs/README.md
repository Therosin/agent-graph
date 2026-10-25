# Build your own application

Start with a running window, give it your application's identity, then replace the starter interface one piece at a time. These guides follow that path. Paths in examples are relative to the repository root unless a guide says otherwise.

If you are new to the template, read [Getting started](GettingStarted.md), [Application identity](AppIdentity.md), and [App shell](AppShell.md) first. You can leave the native examples in place while you build your own screens, then remove the example panels when they have served their purpose.

Your screens and client stores live in `packages/astro`. Application services live in `packages/backend`, while `packages/desktop` owns the native window and OS integrations. Put reusable types in `packages/shared` and app identity/defaults in `packages/config`. The guides show how these pieces connect as you add a feature.

## Shape the application

| Guide | What you will make or change |
| --- | --- |
| [Getting started](GettingStarted.md) | Run the template on Windows or Linux and choose desktop or browser development. |
| [Application identity](AppIdentity.md) | Set your app's name, version, defaults, and build overrides. |
| [App shell](AppShell.md) | Redesign the window chrome, titlebar, sidebar, colors, and transparency. |
| [Pages and layouts](PagesAndLayouts.md) | Add application screens and MDX content, and introduce Vue where it helps. |
| [State and data](StateAndData.md) | Connect a screen to a shared Nanostore and keep HTTP requests in store actions. |
| [Backend](Backend.md) | Add an API route and decide where application services and shared types belong. |
| [Desktop events](DesktopEvents.md) | Await native operations or push updates from the backend into a store. |

## Use the desktop

Native components are already registered by the host. Your frontend can call them through the same event helper used for window settings.

| Guide | What it covers |
| --- | --- |
| [File dialogs](FileDialogs.md) | Choose files and folders, request a save path, and handle cancellation. |
| [Notifications](Notifications.md) | Show a toast and handle actions when the platform supports them. |
| [System tray](Tray.md) | Brand the tray icon, compose menus, and keep a window available while hidden. |
| [Desktop tools](DesktopTools.md) | Copy text, find user/application directories, open paths, and move files to Trash. |
| [Packaging](Packaging.md) | Build Windows/Linux executables and distribute their required native assets. |
| [CI and releases](CI.md) | Run automated checks and download PR builds, main releases, or develop testing builds. |

The repository's `docs/` directory teaches developers using the template. The starter application's `/docs/` route is a separate MDX example; replace it with your own application's content.

For checks, testing, and changes to the template itself, see [Contributing](Contributing.md).
