import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'node:path';

export default defineConfig({
  base: './',
  resolve: {
    alias: [{ find: '@', replacement: path.resolve(__dirname, 'src') }]
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
      },
    },
    rollupOptions: {
      input: {
        background: path.resolve(__dirname, 'src/scripts/service-worker/service-worker.ts'),
        popup: path.resolve(__dirname, 'src/scripts/popup/index.tsx'),
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'src/scripts/popup/popup.html',
          dest: '.',
        },
        {
          src: 'manifest.json',
          dest: '.',
        },
      ],
    }),
  ],
});