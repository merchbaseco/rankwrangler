import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    target: 'node18',
    ssr: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/index.ts'),
      external: [
        // Node.js built-ins
        /^node:/,
        // Fastify and plugins (don't bundle well)
        'fastify',
        '@fastify/cors',
        '@fastify/helmet',
        // Amazon SP-API SDK (complex dependencies, doesn't bundle well)
        '@amazon-sp-api-release/amazon-sp-api-sdk-js',
        // pg-boss (PostgreSQL job queue, uses native modules)
        'pg-boss'
      ],
      output: {
        format: 'es',
        entryFileNames: 'index.js'
      }
    },
    outDir: 'dist',
    emptyOutDir: true,
    minify: false
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});