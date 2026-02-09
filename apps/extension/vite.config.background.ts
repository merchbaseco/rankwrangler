import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(async () => ({
    base: './',
    resolve: {
        alias: [{ find: '@', replacement: path.resolve(__dirname, 'src') }],
    },
    build: {
        outDir: 'dist',
        emptyOutDir: false, // Don't clear dist folder
        minify: 'terser',
        terserOptions: {
            compress: {
                drop_console: false,
            },
        },
        rollupOptions: {
            input: {
                background: path.resolve(__dirname, 'src/scripts/service-worker/service-worker.ts'),
            },
            output: {
                entryFileNames: '[name].js',
                inlineDynamicImports: true, // This works with single input
            },
        },
    },
}));