import { describe, expect, it } from 'bun:test';
import {
    DEFAULT_NPM_KEYCHAIN_SERVICE,
    loadRepoNpmToken,
    resolveNpmToken,
} from './with-npm-token.mjs';

describe('loadRepoNpmToken', () => {
    it('loads NPM_TOKEN from the repository env file', async () => {
        const env: Record<string, string> = {};

        const loaded = await loadRepoNpmToken({
            env,
            readFileImpl: async () => 'OTHER=value\nNPM_TOKEN="npm_repo_token"\n',
        });

        expect(loaded).toBe(true);
        expect(env.NPM_TOKEN).toBe('npm_repo_token');
    });

    it('preserves an explicitly exported NPM_TOKEN', async () => {
        const env = { NPM_TOKEN: 'npm_exported_token' };
        let read = false;

        const loaded = await loadRepoNpmToken({
            env,
            readFileImpl: async () => {
                read = true;
                return 'NPM_TOKEN=npm_repo_token\n';
            },
        });

        expect(loaded).toBe(false);
        expect(read).toBe(false);
        expect(env.NPM_TOKEN).toBe('npm_exported_token');
    });
});

describe('resolveNpmToken', () => {
    it('prefers NPM_TOKEN from the environment', async () => {
        const resolved = await resolveNpmToken({
            env: {
                NPM_TOKEN: 'npm_env_token',
            },
            platform: 'darwin',
        });

        expect(resolved).toEqual({
            token: 'npm_env_token',
            source: 'env',
        });
    });

    it('falls back to macOS Keychain when NPM_TOKEN is absent', async () => {
        const resolved = await resolveNpmToken({
            env: {
                USER: 'zknicker',
            },
            platform: 'darwin',
            execFileImpl: async (command, args) => {
                expect(command).toBe('security');
                expect(args).toEqual([
                    'find-generic-password',
                    '-a',
                    'zknicker',
                    '-s',
                    DEFAULT_NPM_KEYCHAIN_SERVICE,
                    '-w',
                ]);

                return {
                    stdout: 'npm_keychain_token\n',
                };
            },
        });

        expect(resolved).toEqual({
            token: 'npm_keychain_token',
            source: 'keychain',
            account: 'zknicker',
            service: DEFAULT_NPM_KEYCHAIN_SERVICE,
        });
    });

    it('rejects non-macOS hosts without NPM_TOKEN in env', async () => {
        await expect(
            resolveNpmToken({
                env: {},
                platform: 'linux',
            })
        ).rejects.toThrow(
            'NPM_TOKEN is required in the environment on non-macOS hosts. Use your CI secret store.'
        );
    });
});
