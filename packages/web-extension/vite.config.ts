import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'node:path';

export default defineConfig({
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
        content: path.resolve(__dirname, 'src/content.ts'),
        background: path.resolve(__dirname, 'src/background.ts'),
        popup: path.resolve(__dirname, 'src/popup.ts'),
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'src/popup.html',
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