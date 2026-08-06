import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    build: {
        target: 'node18',
        ssr: true,
        rollupOptions: {
            input: resolve(currentDirectory, 'src/index.ts'),
            external: [
                // Node.js built-ins
                /^node:/,
                // Fastify and plugins (don't bundle well)
                'fastify',
                '@fastify/cors',
                '@fastify/helmet',
                '@clerk/mcp-tools/server',
                '@modelcontextprotocol/sdk/server/auth/types.js',
                '@modelcontextprotocol/sdk/server/mcp.js',
                '@modelcontextprotocol/sdk/server/streamableHttp.js',
                '@modelcontextprotocol/sdk/types.js',
                // Amazon SP-API SDK (complex dependencies, doesn't bundle well)
                '@amazon-sp-api-release/amazon-sp-api-sdk-js',
                // pg-boss (PostgreSQL job queue, uses native modules)
                'pg-boss',
            ],
            output: {
                format: 'es',
                entryFileNames: 'index.js',
            },
        },
        outDir: 'dist',
        emptyOutDir: true,
        minify: false,
    },
    resolve: {
        alias: {
            '@': resolve(currentDirectory, 'src'),
        },
    },
});
