import { describe, expect, it } from 'bun:test';
import { NPM_TOKEN_ENV, resolveNpmToken } from './with-npm-token.mjs';

describe('resolveNpmToken', () => {
    it('prefers an already-exported token and never contacts 1Password', async () => {
        let called = false;

        const resolved = await resolveNpmToken({
            env: { [NPM_TOKEN_ENV]: 'npm_env_token' },
            execFileImpl: async () => {
                called = true;
                return { stdout: 'npm_varlock_token\n' };
            },
        });

        expect(called).toBe(false);
        expect(resolved).toEqual({ token: 'npm_env_token', source: 'env' });
    });

    it('resolves through varlock printenv under the release switch', async () => {
        const resolved = await resolveNpmToken({
            env: {},
            execFileImpl: async (command, args, options) => {
                expect(command).toBe('bunx');
                expect(args).toEqual(['varlock', 'printenv', NPM_TOKEN_ENV]);
                expect(options.env.RANKWRANGLER_RESOLVE_RELEASE_TOKENS).toBe(
                    'true'
                );

                return { stdout: 'npm_varlock_token\n' };
            },
        });

        expect(resolved).toEqual({
            token: 'npm_varlock_token',
            source: 'varlock',
        });
    });

    it('fails loudly when varlock resolves an empty token', async () => {
        await expect(
            resolveNpmToken({
                env: {},
                execFileImpl: async () => ({ stdout: '\n' }),
            })
        ).rejects.toThrow('resolved empty');
    });
});
