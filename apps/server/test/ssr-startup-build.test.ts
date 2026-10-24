import { describe, expect, it } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'bun';

describe.skipIf(!process.env.CATALOG_SSR_FIXTURE_ROOT)('packaged server startup', () => {
    it('resolves lazy modules during top-level startup without an entry-module deadlock', async () => {
        const root = process.env.CATALOG_SSR_FIXTURE_ROOT;
        if (!root) {
            throw new Error('The database harness must own the fixture directory');
        }
        const ts = await import('typescript');
        const source = ts.createSourceFile(
            'index.ts',
            await readFile(new URL('../src/index.ts', import.meta.url), 'utf8'),
            ts.ScriptTarget.Latest
        );
        const awaits: number[] = [];
        const visit = (node: import('typescript').Node) => {
            if (ts.isFunctionLike(node)) {
                return;
            }
            if (ts.isAwaitExpression(node)) {
                awaits.push(node.pos);
            }
            ts.forEachChild(node, visit);
        };
        visit(source);
        expect(awaits).toEqual([]);
        const { build } = await import('vite');
        const { default: config } = await import('../vite.config');
        await mkdir(root, { recursive: true });
        await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
        await writeFile(
            join(root, 'main.ts'),
            "export const state = { ready: true }; const start = async () => { await Promise.resolve(); const module = await import('./capacity'); console.log('STARTUP_READY', module.read()); }; void start();"
        );
        await writeFile(
            join(root, 'capacity.ts'),
            "import { state } from './main'; export const read = () => state.ready;"
        );
        await build({
            ...config,
            configFile: false,
            logLevel: 'silent',
            build: {
                ...config.build,
                outDir: join(root, 'dist'),
                rollupOptions: { ...config.build?.rollupOptions, input: join(root, 'main.ts') },
            },
        });
        const child = spawn(['node', join(root, 'dist/index.js')], {
            stdout: 'pipe',
            stderr: 'pipe',
        });
        expect(await child.exited).toBe(0);
        expect(await new Response(child.stdout).text()).toContain('STARTUP_READY true');
    });
});
