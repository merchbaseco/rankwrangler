import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import utwm from 'unplugin-tailwindcss-mangle/vite';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(async () => ({
    base: './',
    resolve: {
        alias: [{ find: '@', replacement: path.resolve(__dirname, 'src') }],
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        minify: 'terser',
        cssCodeSplit: false,
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
                assetFileNames: '[name].[ext]',
            },
        },
    },
    plugins: [
        (await import('@tailwindcss/vite')).default(),
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
                {
                    src: '../../assets/logo.png',
                    dest: 'images',
                },
            ],
        }),
        {
            name: 'inline-css-popup',
            enforce: 'post',
            closeBundle() {
                const outDir = 'dist';
                const cssPath = path.join(outDir, 'style.css');
                const htmlPath = path.join(outDir, 'popup.html');

                if (fs.existsSync(cssPath) && fs.existsSync(htmlPath)) {
                    const cssContent = fs.readFileSync(cssPath, 'utf-8');
                    let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

                    // Inject CSS into the existing <style> tag or create a new one
                    const styleTagRegex = /<style>([\s\S]*?)<\/style>/;
                    if (styleTagRegex.test(htmlContent)) {
                        htmlContent = htmlContent.replace(
                            styleTagRegex,
                            `<style>$1\n${cssContent}</style>`
                        );
                    } else {
                        htmlContent = htmlContent.replace(
                            '</head>',
                            `  <style>\n${cssContent}\n  </style>\n</head>`
                        );
                    }

                    fs.writeFileSync(htmlPath, htmlContent);
                }
            },
        },
    ],
}));
