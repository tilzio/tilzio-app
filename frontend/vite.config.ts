import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import wails from "@wailsio/runtime/plugins/vite";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
    strictPort: true,
  },
  plugins: [svelte(), wails("./bindings"), svelteTesting()],
  test: {
    // Polyfill DragEvent (not in jsdom) so that fireEvent.drop/dragover forwards
    // clientX/clientY correctly in unit tests. See src/test-setup.ts.
    setupFiles: ["./src/test-setup.ts"],
  },
});
