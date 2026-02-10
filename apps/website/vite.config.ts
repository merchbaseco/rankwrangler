import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const envDir = resolve(rootDir, '../..');

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, envDir, '');
    const apiProxyTarget = env.WEBSITE_API_PROXY_TARGET ?? 'http://localhost:8080';

    return {
        envDir,
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
                },
            },
        },
        build: {
            outDir: 'dist',
            emptyOutDir: true,
        },
    };
});
