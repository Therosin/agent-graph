# Build your application's backend

The backend is where application services live: a database, document processing, filesystem work, or other capabilities your app needs. It runs in its own Bun worker in desktop mode. In browser development, the same HTTP server runs without the native host.

Start in [packages/backend/server.ts](../packages/backend/server.ts). It serves the HTTP API and the built frontend from one origin. Development proxies `/api` from Astro to that server, so frontend stores can use relative URLs in both modes.

## Add your first API route

For a small complete example, add this branch inside the server's `fetch` handler, after the existing method check and before the generic `/api/` not-found branch:

```ts
if (url.pathname === "/api/greeting") {
  const response = Response.json(
    { message: `Welcome to ${AppConfig.appName}` },
    { headers: { "Cache-Control": "no-store" } },
  );
  return request.method === "HEAD"
    ? new Response(null, response)
    : response;
}
```

`AppConfig` is already imported in that file. Restart development, then fetch `/api/greeting` from your frontend. [State and data](StateAndData.md) has the matching store and Vue component, so you can follow a complete route-to-interface example.

The starter accepts only `GET` and `HEAD`. When you add write operations, update that method guard and its `Allow` header as well as adding a method-specific route. Parse and validate request bodies in your own API handlers, and return responses your store actions can handle.

## Move real work into services

As routes grow, put their application logic in modules under `packages/backend`, for example `services/projects.ts`. A route can call `listProjects()` or `saveProject(input)` and turn the result into a response. Your services can use whichever Bun-compatible libraries suit the application; the template does not choose a database or application framework for you.

Install backend-only dependencies in the backend workspace rather than the frontend:

```sh
cd packages/backend
bun add <package-name>
```

Replace `<package-name>` with the library you have chosen. Return to the repository root for the root development and build commands.

## Share contracts, not backend implementation

Put types needed on both sides in `packages/shared`. For example, create `packages/shared/greeting.ts`:

```ts
export interface Greeting {
  message: string;
}
```

Then either Bun thread or the frontend can use:

```ts
import type { Greeting } from "shared/greeting";
```

The existing wildcard package exports cover new TypeScript modules automatically. Keep database clients, native FFI code, and backend-only imports out of shared modules used by the frontend. Configuration is a separate workspace: import your app identity and defaults from `config`.

The workspace aliases are already dependencies of the consuming packages. If adding a new workspace later, use Bun's `workspace:` dependency protocol; a dependency value such as `shared:*` is not that protocol.

## Talk to the desktop when you need it

Normal application requests use HTTP. Internal backend/desktop coordination uses the parent WorkerRPC channel set up in [backend/main.ts](../packages/backend/main.ts).

The existing worker branch obtains `parent` before its first await, receives startup configuration, starts the server, and reports readiness. Keep this initialization order when extending it. Add your own named handlers there for internal services, and use `parent.Emit(...)` when the backend needs the desktop to do something.

For frontend notifications, the generic route is already registered:

```ts
await parent.Emit("window:dispatch", {
  name: "projects:changed",
  detail: { projectId: "example" },
});
```

Call this in the worker's scope after a service completes. The [Desktop events guide](DesktopEvents.md) shows the store listener. If a service is also used in browser mode, pass it a notification callback from the worker setup rather than making it assume a native parent always exists.

## Lifecycle and storage

The desktop owns starting and stopping its backend. It pumps WorkerRPC calls while the WebView is alive and asks the backend to shut down before terminating the worker. Add cleanup for your database, watchers, or timers to the worker's existing shutdown handler.

Choose writable application directories for persistent data. The executable's current working directory may be unrelated to your app, and packaged frontend assets live inside the executable. [Desktop tools](DesktopTools.md) explains the supplied path helper; if your backend owns storage, resolve or pass the appropriate directory to the service that needs it.

[Documentation home](README.md) · [State and data](StateAndData.md) · [Desktop events](DesktopEvents.md)
