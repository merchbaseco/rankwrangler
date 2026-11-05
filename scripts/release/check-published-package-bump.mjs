#!/usr/bin/env node

import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { readJson } from './release-utils.mjs';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

// Must match the `published_packages` input in .github/workflows/deploy.yml,
// which runs the same check again after deploy (Deploy Stack's version bump
// backstop) against the merged commit.
export const PUBLISHED_PACKAGES = [
    { dir: 'packages/http-client', name: '@rankwrangler/http-client' },
    { dir: 'packages/cli', name: '@rankwrangler/cli' },
];

/**
 * A package's shipped scope, relative to its dir: npm always ships package.json
 * regardless of "files", and "files" itself names the build output directory
 * (not source, which is gitignored and never appears in a diff), so that entry
 * is swapped for the TypeScript `rootDir` that actually feeds it.
 */
export const resolveShippedScope = async (dir, deps = defaultDeps) => {
    const packageJson = await deps.readPackageJson(dir);
    const files = packageJson.files ?? [];
    const tsconfig = await deps.readTsconfig(dir);
    const outDirName = tsconfig
        ? path.posix.basename(tsconfig.compilerOptions?.outDir ?? '')
        : null;
    const rootDirName = tsconfig
        ? path.posix.basename(tsconfig.compilerOptions?.rootDir ?? '')
        : null;

    const scope = new Set(['package.json']);
    for (const entry of files) {
        scope.add(entry === outDirName && rootDirName ? rootDirName : entry);
    }

    return scope;
};

export const checkPackageBump = async ({ dir, name }, deps = defaultDeps) => {
    const packageJson = await deps.readPackageJson(dir);
    const version = packageJson.version;
    const published = await deps.npmViewVersion(name);

    if (published === null || published !== version) {
        return { name, version, status: 'ok' };
    }

    const tag = `v${version}`;
    if (!(await deps.fetchTag(tag))) {
        return { name, version, status: 'ok' };
    }

    const scope = await resolveShippedScope(dir, deps);
    const changed = await deps.changedFilesSinceTag(tag, dir);
    const changedShippedFiles = changed.filter(file => matchesScope(file, scope));

    if (changedShippedFiles.length > 0) {
        return { name, version, status: 'changed', files: changedShippedFiles };
    }

    return { name, version, status: 'ok' };
};

export const main = async () => {
    const results = await Promise.all(PUBLISHED_PACKAGES.map(pkg => checkPackageBump(pkg)));
    const failures = results.filter(result => result.status === 'changed');

    if (failures.length > 0) {
        for (const failure of failures) {
            console.error(
                `${failure.name}@${failure.version} changed a published file since v${failure.version} without a version bump:`
            );
            for (const file of failure.files) {
                console.error(`  - ${file}`);
            }
        }
        console.error('Run `bun run release:bump <patch|minor|major>` and update CHANGELOG.md.');
        process.exit(1);
    }

    console.log('Published-package version bump check passed.');
};

const matchesScope = (relativeFile, scope) =>
    [...scope].some(entry => relativeFile === entry || relativeFile.startsWith(`${entry}/`));

const defaultDeps = {
    readPackageJson: dir => readJson(path.posix.join(dir, 'package.json')),
    readTsconfig: async dir => {
        try {
            return await readJson(path.posix.join(dir, 'tsconfig.json'));
        } catch {
            return null;
        }
    },
    npmViewVersion: async name => {
        try {
            const { stdout } = await execFileAsync('npm', ['view', name, 'version', '--json']);
            return JSON.parse(stdout.trim());
        } catch {
            return null;
        }
    },
    fetchTag: async tag => {
        try {
            await execFileAsync(
                'git',
                ['fetch', 'origin', `refs/tags/${tag}:refs/tags/${tag}`],
                { cwd: repoRoot }
            );
            return true;
        } catch {
            return false;
        }
    },
    changedFilesSinceTag: async (tag, dir) => {
        const { stdout } = await execFileAsync(
            'git',
            ['diff', '--name-only', tag, 'HEAD', '--', dir],
            { cwd: repoRoot }
        );
        const prefix = `${dir}/`;
        return stdout
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map(file => (file.startsWith(prefix) ? file.slice(prefix.length) : file));
    },
};

const reportFailure = error => {
    console.error(`check-published-package-bump error: ${error.message}`);
    process.exit(1);
};

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    await main().catch(reportFailure);
}
