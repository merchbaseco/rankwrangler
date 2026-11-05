import { describe, expect, it } from 'bun:test';
import { checkPackageBump, resolveShippedScope } from './check-published-package-bump.mjs';

const tsconfigWithSrcRootDir = {
    compilerOptions: { outDir: './dist', rootDir: './src' },
};

describe('resolveShippedScope', () => {
    it('swaps the build output entry for the source directory that feeds it', async () => {
        const scope = await resolveShippedScope('packages/http-client', {
            readPackageJson: async () => ({ files: ['dist', 'README.md'] }),
            readTsconfig: async () => tsconfigWithSrcRootDir,
        });

        expect(scope).toEqual(new Set(['package.json', 'src', 'README.md']));
    });

    it('keeps a non-build-output entry literal and always includes package.json', async () => {
        const scope = await resolveShippedScope('packages/http-client', {
            readPackageJson: async () => ({ files: ['README.md'] }),
            readTsconfig: async () => null,
        });

        expect(scope).toEqual(new Set(['package.json', 'README.md']));
    });
});

describe('checkPackageBump', () => {
    const baseDeps = {
        readPackageJson: async () => ({ version: '1.2.3', files: ['dist', 'README.md'] }),
        readTsconfig: async () => tsconfigWithSrcRootDir,
        npmViewVersion: async () => '1.2.3',
        fetchTag: async () => true,
        changedFilesSinceTag: async () => [],
    };

    it('passes when the version is already ahead of the published one', async () => {
        const result = await checkPackageBump(
            { dir: 'packages/http-client', name: '@rankwrangler/http-client' },
            { ...baseDeps, npmViewVersion: async () => '1.2.2' }
        );

        expect(result).toEqual({ name: '@rankwrangler/http-client', version: '1.2.3', status: 'ok' });
    });

    it('passes when the package has never been published', async () => {
        const result = await checkPackageBump(
            { dir: 'packages/http-client', name: '@rankwrangler/http-client' },
            { ...baseDeps, npmViewVersion: async () => null }
        );

        expect(result.status).toBe('ok');
    });

    it('passes when the release tag is missing', async () => {
        const result = await checkPackageBump(
            { dir: 'packages/http-client', name: '@rankwrangler/http-client' },
            { ...baseDeps, fetchTag: async () => false }
        );

        expect(result.status).toBe('ok');
    });

    it('passes when only out-of-scope files changed (tests, scripts, fixtures)', async () => {
        const result = await checkPackageBump(
            { dir: 'packages/http-client', name: '@rankwrangler/http-client' },
            {
                ...baseDeps,
                changedFilesSinceTag: async () => ['test/public-client.test.ts', 'tsconfig.json'],
            }
        );

        expect(result.status).toBe('ok');
    });

    it('fails when a shipped source file changed without a version bump', async () => {
        const result = await checkPackageBump(
            { dir: 'packages/http-client', name: '@rankwrangler/http-client' },
            {
                ...baseDeps,
                changedFilesSinceTag: async () => ['src/index.ts', 'test/public-client.test.ts'],
            }
        );

        expect(result).toEqual({
            name: '@rankwrangler/http-client',
            version: '1.2.3',
            status: 'changed',
            files: ['src/index.ts'],
        });
    });

    it('fails when README.md changed without a version bump', async () => {
        const result = await checkPackageBump(
            { dir: 'packages/cli', name: '@rankwrangler/cli' },
            { ...baseDeps, changedFilesSinceTag: async () => ['README.md'] }
        );

        expect(result.status).toBe('changed');
    });
});
