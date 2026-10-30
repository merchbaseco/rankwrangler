import { describe, expect, it } from 'bun:test';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { createCloudflareAssertionVerifier } from '@merchbaseco/access';
import { createCloudflareSigningKeys } from './cloudflare-signing-keys';

const ISSUER = 'https://team.cloudflareaccess.com';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'key-1', alg: 'RS256', use: 'sig' };

const fakeCloudflare = () => {
    const state = { fetches: 0, clock: 0 };
    const keys = createCloudflareSigningKeys({
        issuer: ISSUER,
        fetchKeySet: async () => {
            state.fetches += 1;
            return { keys: [jwk] };
        },
        now: () => state.clock,
    });
    return { keys, state };
};

describe('Cloudflare signing keys', () => {
    it('verifies an assertion through the access verifier after one warm fetch', async () => {
        const { keys, state } = fakeCloudflare();
        await keys.warm();
        const verifier = createCloudflareAssertionVerifier(
            { issuer: ISSUER, audience: 'aud-1' },
            keys.resolve
        );
        const now = Math.floor(Date.now() / 1000);
        const assertion = signJwt({
            iss: ISSUER,
            aud: 'aud-1',
            sub: 'user-1',
            email: 'user@example.com',
            type: 'app',
            iat: now - 10,
            exp: now + 600,
        });
        expect(await verifier.verify(assertion)).toMatchObject({
            kind: 'person',
            subject: 'user-1',
        });
        expect(await verifier.verify(assertion)).toMatchObject({ kind: 'person' });
        expect(state.fetches).toBe(1);
    });

    it('serves stale keys at once and refreshes them in the background', async () => {
        const { keys, state } = fakeCloudflare();
        await keys.warm();
        state.clock = 6 * 60_000;
        expect(await keys.resolve({ kid: 'key-1' })).toBeDefined();
        expect(state.fetches).toBe(2);
    });

    it('rejects unknown and missing key ids, refetching for unknown ones every 30s', async () => {
        const { keys, state } = fakeCloudflare();
        await keys.warm();
        await expect(keys.resolve({ kid: 'other' })).rejects.toThrow('unauthenticated');
        expect(state.fetches).toBe(1);
        state.clock = 31_000;
        await expect(keys.resolve({ kid: 'other' })).rejects.toThrow('unauthenticated');
        expect(state.fetches).toBe(2);
        await expect(keys.resolve({})).rejects.toThrow('unauthenticated');
    });
});

const signJwt = (payload: Record<string, unknown>) => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const body = `${encode({ alg: 'RS256', kid: 'key-1', typ: 'JWT' })}.${encode(payload)}`;
    const signature = createSign('RSA-SHA256').update(body).sign(privateKey).toString('base64url');
    return `${body}.${signature}`;
};
