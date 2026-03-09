import { describe, expect, it } from 'bun:test';
import {
    assertHttpClientVersionPublished,
    resolveExpectedHttpClientVersion,
} from './ensure-cli-http-client-published.mjs';

describe('resolveExpectedHttpClientVersion', () => {
    it('returns the pinned http-client version when it matches the CLI version', () => {
        const version = resolveExpectedHttpClientVersion({
            version: '0.4.0',
            dependencies: {
                '@rankwrangler/http-client': '^0.4.0',
            },
        });

        expect(version).toBe('0.4.0');
    });

    it('throws when the dependency version is not synchronized with the CLI version', () => {
        expect(() =>
            resolveExpectedHttpClientVersion({
                version: '0.4.0',
                dependencies: {
                    '@rankwrangler/http-client': '^0.2.3',
                },
            }),
        ).toThrow(
            'packages/cli must depend on @rankwrangler/http-client:^0.4.0 before publish',
        );
    });

    it('throws when the dependency is not pinned with a caret semver', () => {
        expect(() =>
            resolveExpectedHttpClientVersion({
                version: '0.4.0',
                dependencies: {
                    '@rankwrangler/http-client': 'workspace:*',
                },
            }),
        ).toThrow('packages/cli must pin @rankwrangler/http-client with ^X.Y.Z before publish');
    });
});

describe('assertHttpClientVersionPublished', () => {
    it('accepts the required version when npm resolves the same version', async () => {
        await expect(
            assertHttpClientVersionPublished('0.4.0', async version => version),
        ).resolves.toBeUndefined();
    });

    it('throws when npm resolves a different version', async () => {
        await expect(
            assertHttpClientVersionPublished('0.4.0', async () => '0.4.1'),
        ).rejects.toThrow(
            'npm reported @rankwrangler/http-client@0.4.1 while 0.4.0 is required',
        );
    });
});
