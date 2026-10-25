# Make the app shell your own

The shell is the part of your design that surrounds every screen: window surface, titlebar, controls, navigation, and space for page content. The frontend is the WebView document itself. You can compose and style it with ordinary Astro and CSS.

## Know which piece you are editing

Start with these files:

| File | What you change there |
| --- | --- |
| [BaseLayout.astro](../packages/astro/src/layouts/BaseLayout.astro) | Shared document head, metadata, global styles, bridge script, and the common WindowChrome wrapper. |
| [WindowChrome.astro](../packages/astro/src/components/WindowChrome.astro) | Titlebar markup, window controls, drag surface, and the window content slot. |
| [AppLayout.astro](../packages/astro/src/layouts/AppLayout.astro) | Sidebar, app navigation, and the main application workspace. |
| [PageLayout.astro](../packages/astro/src/layouts/PageLayout.astro) | Navigation and a reading area for documents and MDX. |
| [global.css](../packages/astro/src/styles/global.css) | Shared colors, sizing, surfaces, chrome, and layout rules. |

Both application and document layouts compose BaseLayout, so a chrome change there reaches both. Keep the `/webui.js` script in BaseLayout: it connects your custom controls and native calls to the desktop host.

## Change the colors and proportions

Begin in `global.css`. The existing `:root` block defines `--surface`, `--border`, `--muted`, and `--accent`, along with the font and default text color. For a warmer accent, edit the existing declaration:

```css
:root {
  --accent: #e8c69b;
  --muted: #a9a39a;
}
```

Some starter surfaces and button colors are literal colors, so changing a variable alone is not a complete theme switch. Adjust `.window-chrome`, `.panel`, `.button`, and `.button-primary` as you develop your palette.

For a wider sidebar, change the first column in `.app-layout`:

```css
.app-layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  height: 100%;
}
```

The outer window fills `100dvh`. Its content uses a flex child with `min-height: 0`, and the application/document areas own their scrolling. Preserve that height chain when replacing the layout so long content scrolls inside the app rather than underneath the titlebar.

## Redesign the titlebar

Edit the markup inside `WindowChrome.astro` to replace the starter mark, move the title, or change the control icons. If you keep its existing script, preserve the hooks it uses:

| Hook | Purpose |
| --- | --- |
| `data-window-chrome` and `data-settings` | Find the shell and read initial window options. |
| `data-window-title` | Show the title from AppSettings. |
| `data-desktop-connection` | Show connection state. |
| `data-window-command="minimize"`, `"maximize"`, or `"close"` | Connect your buttons to native window commands. |

For example, a close button can use your own icon while retaining its command and accessible name:

```astro
<button type="button" class="window-close"
  data-window-command="close" aria-label="Close window" disabled>
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" />
  </svg>
</button>
```

Keep dragging on empty titlebar space and turn it off for interactive controls. The template already applies both drag declarations to `.window-titlebar` and no-drag declarations to buttons, links, and inputs. Add the same exclusion for custom controls such as a titlebar select or search widget:

```css
.titlebar-search {
  -webkit-app-region: no-drag;
  --webui-app-region: no-drag;
}
```

BaseLayout also forwards a named `titlebar` slot. A page or custom layout using BaseLayout directly can supply content there:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout title="My workspace">
  <span slot="titlebar">Personal workspace</span>
  <main class="app-main"><h1>Your content</h1></main>
</BaseLayout>
```

AppLayout and PageLayout currently forward their normal content slot. If you want their pages to supply titlebar content too, add named-slot forwarding in those layouts, following BaseLayout's existing pattern.

## Set window behavior and transparency

Set app-wide starting behavior in `WindowConfig.defaults` in [config.ts](../packages/config/config.ts). Window-specific props belong on WindowChrome at its composition point in BaseLayout. For example, this changes its initial transparency:

```astro
<WindowChrome transparent={false}>
  <slot name="titlebar" slot="titlebar" />
  <slot />
</WindowChrome>
```

The AppSettings store synchronizes these options with the native window. To change them from client code while the app is running:

```ts
import { updateAppSettings } from "../stores/AppSettings";

await updateAppSettings({ transparent: true, title: "Field Notes — Editing" });
```

Run this in a client-side action and handle a rejected promise if the desktop is disconnected. `minimisable`, `maximisable`, `closeable`, and `resizable` use the same store. A page's `title` prop controls its document title; use AppSettings when you mean the native window/chrome title.

Native transparency and CSS work together. Keep `html` and `body` transparent, then style `.window-chrome[data-transparent='true']` with the opacity you want. The starter uses a mostly opaque surface; lower its alpha if you want more of the desktop to show through. Check the result in the native app on your target desktop.

Closing still quits the app. If your design offers a background mode, use the explicit hide/show operations described in [System tray](Tray.md).

[Documentation home](README.md) · [Next: pages and layouts](PagesAndLayouts.md)
