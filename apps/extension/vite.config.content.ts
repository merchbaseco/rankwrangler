// TypeScript allows us to safely import JSON with assertion

import path from 'node:path';
import react from '@vitejs/plugin-react';
import { type BuildOptions, defineConfig } from 'vite';
import packageJson from './package.json' with { type: 'json' };
import { isDev, r } from './scripts/utility';

const { name }: { name: string } = packageJson;

console.info(' ---> Starting Content Script Build 🤞 <---');

const config = defineConfig(async () => ({
    plugins: [
        (await import('@tailwindcss/vite')).default(),
        react(),
    ],

    resolve: {
        alias: [{ find: '@', replacement: path.resolve(__dirname, 'src') }],
    },

    define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    },

    build: {
        outDir: r('dist'),
        cssCodeSplit: false,
        emptyOutDir: false,
        sourcemap: isDev ? 'inline' : false,
        minify: 'terser',
        terserOptions: {
            compress: {
                drop_console: false,
            },
        },
        rollupOptions: {
            input: {
                content: r('src/scripts/content/index.tsx'),
            },
            output: {
                entryFileNames: 'content.js',
                format: 'iife', // Bundle everything together so chrome.runtime is available in our React app/components.
                inlineDynamicImports: true,
            },
        },
    } as BuildOptions,
}));

export default config;
