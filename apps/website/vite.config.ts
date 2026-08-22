import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import serverPackageJson from '../server/package.json' with { type: 'json' };

const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const envDir = resolve(rootDir, '../..');

// Varlock supplies every value as process environment, so no .env file is
// read here. `envDir` stays unset for the same reason: a developer's stray
// .env.local must not override the resolved contract.
export default defineConfig(() => {
    const apiProxyTarget =
        process.env.RANKWRANGLER_WEBSITE_API_PROXY_TARGET ?? 'http://localhost:8080';
    const appVersion =
        process.env.VITE_RANKWRANGLER_APP_VERSION || serverPackageJson.version;

    return {
        define: {
            'import.meta.env.VITE_RANKWRANGLER_APP_VERSION': JSON.stringify(appVersion),
        },
        plugins: [react(), tailwindcss(), tsconfigPaths()],
        server: {
            port: 5173,
            strictPort: false,
            fs: {
                allow: [envDir, rootDir],
            },
            proxy: {
                '/api': {
                    target: apiProxyTarget,
                    changeOrigin: true,
                    secure: false,
                    ws: true,
                },
            },
        },
        build: {
            outDir: 'dist',
            emptyOutDir: true,
        },
    };
});
