// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";
import vue from "@astrojs/vue";
import mdx from "@astrojs/mdx";
import { buildConfigModule, isConfigModule, loadBuildConfig } from "../../scripts/build-config.ts";

const define = JSON.parse(process.env.APP_BUILD_DEFINES ?? "{}");
const { BackendConfig, FrontendConfig } = loadBuildConfig(define);
const backendDefaults = BackendConfig.defaults;
const frontendDefaults = FrontendConfig.defaults;
const backend = new URL(`http://${backendDefaults.host}`);
backend.port = String(process.env.BACKEND_PORT ?? backendDefaults.port);

// https://astro.build/config
export default defineConfig({
  integrations: [vue({ appEntrypoint: "/src/vue/app" }), mdx()],
  server: { host: frontendDefaults.host, port: Number(process.env.ASTRO_PORT ?? frontendDefaults.port) },
  vite: {
    define,
    ssr: { noExternal: ["config", "@astro-desktop/config"] },
    plugins: [tailwindcss(), {
      name: "application-config",
      enforce: "pre",
      transform(_code, id) {
        if (isConfigModule(id) && Object.keys(define).length)
          return { code: buildConfigModule(define), map: null };
      },
    }],
    server: {
      strictPort: true,
      proxy: {
        "/api": backend.origin,
        "/webui.js": backend.origin,
      },
    },
  },
});
