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
    // `RANKWRANGLER_DEV_HOST` is the repository's contract for this server's
    // bind address, and it defaults to loopback. Vite's own default of
    // `localhost` is not the same thing: on a host that resolves `localhost` to
    // `::1` first, it binds IPv6 only, which is invisible both to an IPv4
    // client and to a port forwarder watching for listening sockets. An
    // environment reached through such a forwarder sets `0.0.0.0` for its own
    // dev command; everywhere else the loopback default keeps the dev server —
    // and the synthetic seed data behind it — off the network.
    const devHost = process.env.RANKWRANGLER_DEV_HOST ?? '127.0.0.1';
    const appVersion =
        process.env.VITE_RANKWRANGLER_APP_VERSION || serverPackageJson.version;

    return {
        define: {
            'import.meta.env.VITE_RANKWRANGLER_APP_VERSION': JSON.stringify(appVersion),
        },
        plugins: [react(), tailwindcss(), tsconfigPaths()],
        server: {
            host: devHost,
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
