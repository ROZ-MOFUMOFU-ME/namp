import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The portal's Express server (src/website.ts) serves the built SPA from
// web/dist and exposes the JSON API under /api. In dev, proxy /api to the
// running portal (default website port 8080); key.html is a static public asset
// served by Vite directly.
export default defineConfig({
    // Everything runs from the repo root (single package.json), so the SPA
    // root is pinned here; paths below stay relative to web/.
    root: import.meta.dirname,
    plugins: [react(), tailwindcss()],
    build: {
        outDir: 'dist',
        emptyOutDir: true
    },
    server: {
        port: 5173,
        proxy: {
            '/api': 'http://localhost:8080'
        }
    }
});
