import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev gateway: one origin for the browser, routed to the separate services.
// The browser never talks to the Core Bank's internal API; /app-api is the bank app's own backend.
const AGENT = process.env.AGENT_ORIGIN || 'http://127.0.0.1:4300';
const BRIDGE = process.env.BRIDGE_ORIGIN || 'http://127.0.0.1:4200';
const APP_API = process.env.APP_API_ORIGIN || 'http://127.0.0.1:4100';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: Number(process.env.WEB_PORT || 5173),
    strictPort: true,
    proxy: {
      '/api/agent': AGENT,
      '/ws': { target: AGENT.replace(/^http/, 'ws'), ws: true },
      '/bridge': BRIDGE,
      '/app-api': APP_API,
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
