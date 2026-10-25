# Pages, layouts, and content

Build most screens with Astro markup, bring in Vue where interaction benefits from it, and use MDX for text-heavy content. All three can share the same shell and state.

## Add an application screen

Create `packages/astro/src/pages/projects.astro`:

```astro
---
import AppLayout from '../layouts/AppLayout.astro';
---
<AppLayout title="Projects">
  <header class="page-heading">
    <span class="eyebrow">Your workspace</span>
    <h1>Projects</h1>
    <p>Organize the things you are working on.</p>
  </header>
  <section class="panel">
    <h2>Your first project</h2>
    <p>Replace this with your application's content.</p>
  </section>
</AppLayout>
```

Astro makes that page available at `/projects/`. Add a navigation link in [AppLayout.astro](../packages/astro/src/layouts/AppLayout.astro), alongside the existing overview and documentation links:

```astro
<a href="/projects/"
  aria-current={Astro.url.pathname.startsWith('/projects') ? 'page' : undefined}>
  Projects
</a>
```

AppLayout supplies the sidebar and main scrolling area. Use PageLayout for reading-oriented screens, or compose BaseLayout in a new layout when your app needs a different structure. [App shell](AppShell.md) explains what stays shared.

## Add interactive behavior with Vue

A Vue file becomes interactive when an Astro page hydrates it. For example, create `packages/astro/src/components/Counter.vue`:

```vue
<script setup lang="ts">
import { ref } from "vue";
const count = ref(0);
</script>

<template>
  <button type="button" class="button" @click="count++">
    Clicked {{ count }} times
  </button>
</template>
```

Import it in the page's frontmatter and place it inside the layout:

```astro
---
import AppLayout from '../layouts/AppLayout.astro';
import Counter from '../components/Counter.vue';
---
<AppLayout title="Projects">
  <h1>Projects</h1>
  <Counter client:load />
</AppLayout>
```

Use local Vue state for local UI details. When multiple components need the same state, use a shared Nanostore as shown in [State and data](StateAndData.md). An island is its own Vue app instance; a store module gives separate islands one shared client-side value.

Astro renders pages during the static build, and Vue islands also render HTML before hydration. Put browser-only work in Astro client scripts, Vue `onMounted`, or guarded store listeners. A native call belongs in a client action rather than a page's frontmatter.

## Write document pages with MDX

Create `packages/astro/src/pages/help.mdx`:

```mdx
---
layout: ../layouts/PageLayout.astro
title: Help
description: Getting comfortable with Field Notes.
---

import Callout from '../components/Callout.astro';
import Counter from '../components/Counter.vue';

# Getting started with Field Notes

Write your documentation here using normal Markdown.

<Callout title="A place to begin">
  Create your first project from the Projects screen.
</Callout>

<Counter client:load />
```

This creates `/help/` with PageLayout's reading width and your common WindowChrome. Style content through the existing `.prose` rules in [global.css](../packages/astro/src/styles/global.css). MDX can use ordinary Astro components and hydrated Vue components in the same document.

## Replace the starter content

The overview imports separate demonstration panels. Remove their imports and elements from [index.astro](../packages/astro/src/pages/index.astro) as you build real screens. Removing an example panel does not unregister its native component; host registrations live in `packages/desktop/main.ts`.

The template's `/docs/` page is sample application content. Replace it with your own help or documentation pages when you are ready. The developer guides you are reading live separately in the repository's root `docs/` directory.

Navigation currently loads a new document. Stores initialize again and the WebUI bridge reconnects; native state remains in the desktop host. Fetch an initial data snapshot on the destination page, then listen for live updates. [Desktop events](DesktopEvents.md) covers that flow.

[Documentation home](README.md) · [Next: state and data](StateAndData.md)
