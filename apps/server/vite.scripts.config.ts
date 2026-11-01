import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import serverConfig from './vite.config';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

// Operator scripts that must run against production ship in the image beside the server bundle, so
// they run inside the server container with its environment. A separate build keeps the server
// bundle free of their chunks.
export default defineConfig({
    ...serverConfig,
    build: {
        ...serverConfig.build,
        outDir: 'dist/scripts',
        emptyOutDir: true,
        rollupOptions: {
            ...serverConfig.build?.rollupOptions,
            input: resolve(currentDirectory, 'src/scripts/reclassify-merch-listings.ts'),
            output: { format: 'es', entryFileNames: 'reclassify-merch-listings.js' },
        },
    },
});
