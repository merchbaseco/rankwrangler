import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'bun:test';
import { publishedPackages } from './published-packages.mjs';

const repoRoot = path.resolve(import.meta.dir, '../..');

describe('publishedPackages', () => {
    it('names every package that publishes to npm, and no others', () => {
        const found = workspacePackages().flatMap(packageJson => {
            const manifest = JSON.parse(readFileSync(packageJson, 'utf8')) as {
                name?: string;
                private?: boolean;
                publishConfig?: { access?: string };
            };
            if (manifest.private || manifest.publishConfig?.access !== 'public') {
                return [];
            }
            return [
                {
                    name: manifest.name,
                    directory: path.relative(repoRoot, path.dirname(packageJson)),
                },
            ];
        });

        expect(found).toEqual([
            { name: '@rankwrangler/cli', directory: 'packages/cli' },
            { name: '@rankwrangler/http-client', directory: 'packages/http-client' },
        ]);
        expect([...publishedPackages].sort((left, right) => left.name.localeCompare(right.name))).toEqual(
            found,
        );
        expect(publishedPackages.map(pkg => pkg.name)).toEqual([
            '@rankwrangler/http-client',
            '@rankwrangler/cli',
        ]);

        const agents = readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
        for (const pkg of found) {
            expect(agents).toContain(pkg.name);
            expect(agents).toContain(pkg.directory);
        }
    });
});

const workspacePackages = () => {
    const roots = ['apps', 'packages'].map(directory => path.join(repoRoot, directory));
    const files: string[] = [];
    for (const root of roots) {
        for (const entry of walk(root)) {
            if (entry.endsWith(`${path.sep}package.json`)) {
                files.push(entry);
            }
        }
    }
    return files.sort();
};

const walk = (directory: string): string[] =>
    readdirSync(directory).flatMap(name => {
        if (name === 'node_modules' || name === 'dist') {
            return [];
        }
        const full = path.join(directory, name);
        if (statSync(full).isDirectory()) {
            return walk(full);
        }
        return [full];
    });
