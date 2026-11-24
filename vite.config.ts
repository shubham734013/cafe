import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      allowedHosts: ['.trycloudflare.com', 'localhost', '127.0.0.1'],
      // HMR configuration that stays on the standard HTTP/HTTPS port behind reverse proxies and Cloudflare tunnels
      hmr:
        process.env.DISABLE_HMR === 'true'
          ? false
          : {
              path: '/vite-hmr/',
            },
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
