import { expect, mock, test } from 'bun:test';
import { ServiceAccessError } from '@merchbaseco/access';
import type { RankWranglerServicePrincipal } from './rankwrangler-access';
import { createRankWranglerRequestAccess } from './request-access';

const assertion = `header.${Buffer.from(JSON.stringify({ exp: 1_900_000_000 })).toString('base64url')}.signature`;
const principal: RankWranglerServicePrincipal = {
    id: '11111111-1111-4111-8111-111111111111',
    service: 'rankwrangler',
    merchbaseUserId: 'mbu_test',
};
const setup = (kind: 'person' | 'api_key' = 'person') => {
    const result = {
        principal,
        merchbaseUserId: principal.merchbaseUserId,
        service: 'rankwrangler' as const,
        credentialKind: kind,
        expiresAt: 1_899_999_990_000,
    };
    const interactive = mock(async () => ({ ...result, credentialKind: 'person' as const }));
    const api = mock(async () => result);
    return {
        authorize: createRankWranglerRequestAccess({
            sessionAccess: { authorize: interactive },
            publicAccess: { authorize: api },
            development: null,
        }),
        interactive,
        api,
    };
};
test('only the interactive origin can produce a dashboard session', async () => {
    const { authorize, interactive, api } = setup();
    expect((await authorize({ host: 'rankwrangler.merchbase.co', assertion })).credentialKind).toBe(
        'session'
    );
    expect(interactive).toHaveBeenCalledWith(assertion);
    expect(api).not.toHaveBeenCalled();
    expect(
        (await authorize({ host: 'rankwrangler-api.merchbase.co', assertion })).credentialKind
    ).toBe('oauth');
    expect(api).toHaveBeenCalledWith(assertion);
});
test('a native customer key remains an API key on the public origin', async () => {
    const { authorize } = setup('api_key');
    expect(
        (await authorize({ host: 'rankwrangler-api.merchbase.co', assertion })).credentialKind
    ).toBe('api_key');
});
test('unknown, internal, forwarded and credential-bearing hosts cannot select human privileges', async () => {
    const { authorize, interactive, api } = setup();
    for (const host of [
        undefined,
        'localhost:8080',
        'rankwrangler-internal.merchbase.co',
        'attacker.example',
        'rankwrangler.merchbase.co:443',
        'rankwrangler.merchbase.co@evil.example',
    ]) {
        await expect(authorize({ host, assertion })).rejects.toMatchObject({
            code: 'unauthenticated',
        });
    }
    expect(interactive).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
});
test('customer seller headers and missing assertions fail before an authorizer runs', async () => {
    const { authorize, interactive, api } = setup();
    await expect(
        authorize({ host: 'rankwrangler.merchbase.co', assertion, userIdHeader: 'mbu_other' })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(
        authorize({ host: 'rankwrangler.merchbase.co', assertion: undefined })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(interactive).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
});
test('a credential rejected by its route verifier never falls back to another audience', async () => {
    const api = mock(() => Promise.reject(new Error('Must not run')));
    const authorize = createRankWranglerRequestAccess({
        development: null,
        publicAccess: { authorize: api },
        sessionAccess: {
            authorize: () => Promise.reject(new ServiceAccessError('unauthenticated')),
        },
    });
    await expect(authorize({ host: 'rankwrangler.merchbase.co', assertion })).rejects.toMatchObject(
        { code: 'unauthenticated' }
    );
    expect(api).not.toHaveBeenCalled();
});

test('a connection preserves the earlier authorized key deadline', async () => {
    const { authorize } = setup('api_key');
    expect((await authorize({ host: 'rankwrangler-api.merchbase.co', assertion })).expiresAtMs).toBe(1_899_999_990_000);
});
