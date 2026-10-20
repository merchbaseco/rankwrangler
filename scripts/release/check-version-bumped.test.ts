import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { findUnbumpedChanges } from './check-version-bumped.mjs';

const roots: string[] = [];
const packages = [{ name: '@rankwrangler/http-client', directory: 'packages/http-client' }];

afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

describe('findUnbumpedChanges', () => {
    it('fails when package source changed and package.json version did not', async () => {
        const checkout = repo();
        const base = commitPackage(checkout, '0.1.0', 'export const value = 1;\n');
        git(checkout, 'tag', '-a', 'v0.1.0', '-m', 'v0.1.0', base);
        commitPackage(checkout, '0.1.0', 'export const value = 2;\n');

        const problems = await findUnbumpedChanges({
            checkout,
            packages,
            publishedVersion: async () => '0.1.0',
            resolveBase: async () => base,
        });

        expect(problems).toEqual([
            `@rankwrangler/http-client@0.1.0 changed since ${base} without a version bump:\npackages/http-client/src/index.js`,
        ]);
    });

    it('passes when the version moved or the tree matches the published commit', async () => {
        const checkout = repo();
        const base = commitPackage(checkout, '0.1.0', 'export const value = 1;\n');

        const unchanged = await findUnbumpedChanges({
            checkout,
            packages,
            publishedVersion: async () => '0.1.0',
            resolveBase: async () => base,
        });
        expect(unchanged).toEqual([]);

        commitPackage(checkout, '0.1.1', 'export const value = 2;\n');
        const bumped = await findUnbumpedChanges({
            checkout,
            packages,
            publishedVersion: async () => '0.1.0',
            resolveBase: async () => base,
        });
        expect(bumped).toEqual([]);
    });
});

const repo = () => {
    const root = mkdtempSync(path.join(tmpdir(), 'rw-bump-'));
    roots.push(root);
    git(root, 'init', '-b', 'main', root);
    git(root, 'config', 'user.email', 'test@example.com');
    git(root, 'config', 'user.name', 'test');
    git(root, 'config', 'commit.gpgsign', 'false');
    git(root, 'config', 'tag.gpgsign', 'false');
    return root;
};

const commitPackage = (checkout: string, version: string, source: string) => {
    const directory = path.join(checkout, 'packages/http-client');
    mkdirSync(path.join(directory, 'src'), { recursive: true });
    writeFileSync(
        path.join(directory, 'package.json'),
        `${JSON.stringify({ name: '@rankwrangler/http-client', version }, null, 4)}\n`,
    );
    writeFileSync(path.join(directory, 'src/index.js'), source);
    git(checkout, 'add', 'packages/http-client');
    git(checkout, 'commit', '-m', version);
    return git(checkout, 'rev-parse', 'HEAD');
};

const git = (cwd: string, ...args: string[]) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout);
    }
    return result.stdout.trim();
};
