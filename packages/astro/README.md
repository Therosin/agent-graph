# Astro Desktop frontend

Start with the [consumer guides](../../docs/README.md) for setup and customization. [Pages and layouts](../../docs/PagesAndLayouts.md), [App shell](../../docs/AppShell.md), and [State and data](../../docs/StateAndData.md) cover the frontend; [Contributing](../../docs/Contributing.md) covers verification.

- `src/layouts`: BaseLayout, AppLayout, and PageLayout.
- `src/components/WindowChrome.astro`: window appearance, controls, and drag regions.
- `src/stores/AppSettings.ts`: window state through WebUI events.
- `src/stores/BackendStatus.ts`: HTTP actions, pushed live metrics, and change notifications in a shared Nanostore.
- `src/desktop/events.ts`: `sendEvent()` for awaited native requests; `onDesktopEvent()` for pushed browser events.
- `src/vue/app.ts`: Vue app entrypoint installing `$sendEvent` globally.
- `src/vue/desktop.ts`: `useDesktopEvents()` for Composition API components.
- `src/components/*.vue`: Vue islands consuming shared Nanostores.
- `src/components/NativeFileDialogDemo.vue`: native file/folder selection and save-path examples.
- `src/components/NativeDesktopDemo.vue`: clipboard, system folders, opening paths, and hiding to the native tray.
- `src/pages/docs.mdx`: MDX with both Astro and Vue components.
- `config` workspace import: shared application identity and default settings.

Use the root `bun run dev` or `bun run dev:web` command to start the matching backend. The Astro development server follows the managed background workflow in [AGENTS.md](./AGENTS.md).
