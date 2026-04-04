import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              id.includes('react-router') ||
              id.includes('@remix-run/router')
            ) {
              return 'router';
            }
            if (
              id.includes('/react/') ||
              id.includes('react-dom') ||
              id.includes('scheduler')
            ) {
              return 'react-core';
            }
            if (id.includes('recharts') || id.includes('d3-')) return 'charts';
            if (id.includes('@radix-ui')) return 'radix';
            if (id.includes('@heroicons')) return 'icons';
            if (id.includes('react-markdown') || id.includes('remark-gfm')) return 'markdown';
            return 'vendor';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
