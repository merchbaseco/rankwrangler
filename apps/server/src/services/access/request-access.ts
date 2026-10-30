import {
    type createCloudflareAccessRequest,
    type createCloudflareServiceAccess,
    ServiceAccessError,
} from '@merchbaseco/access';
import type { createDevCloudflareAccess } from '@merchbaseco/access/dev';
import { INTERNAL_HOST, INTERNAL_PRODUCT_PATH, INTERNAL_PRODUCT_ROUTE } from './internal-access';
import type { RankWranglerServicePrincipal } from './rankwrangler-access';

type DevAccess = Awaited<ReturnType<typeof createDevCloudflareAccess<RankWranglerServicePrincipal>>>;
type Access = Pick<ReturnType<typeof createCloudflareServiceAccess<RankWranglerServicePrincipal>> | DevAccess, 'authorize'>;
export const createRankWranglerRequestAccess =
    ({
        sessionAccess,
        publicAccess,
        development,
        internal,
    }: {
        internal?: Pick<
            ReturnType<typeof createCloudflareAccessRequest<RankWranglerServicePrincipal>>,
            'authorize'
        >;
        sessionAccess: Access;
        publicAccess: Access;
        development: Pick<DevAccess, 'authorize'> | null;
    }) =>
    async (input: {
        method?: string;
        url?: string;
        host: string | undefined;
        assertion: string | undefined;
        userIdHeader?: string | string[];
    }) => {
        if (input.host === INTERNAL_HOST) {
            return authorizeInternalRequest(internal, input);
        }
        if (input.userIdHeader !== undefined) {
            throw new ServiceAccessError('unauthenticated');
        }
        const host = input.host;
        if (development && isLoopbackHost(host)) {
            return {
                ...(await development.authorize()),
                credentialKind: 'session' as const,
                expiresAtMs: null,
            };
        }
        if (!input.assertion) {
            throw new ServiceAccessError('unauthenticated');
        }
        if (host === 'rankwrangler.merchbase.co') {
            const result = await sessionAccess.authorize(input.assertion);
            return {
                ...result,
                credentialKind: 'session' as const,
                expiresAtMs: 'expiresAt' in result ? result.expiresAt : null,
            };
        }
        if (host === 'rankwrangler-api.merchbase.co') {
            const result = await publicAccess.authorize(input.assertion);
            return {
                ...result,
                credentialKind:
                    result.credentialKind === 'person' ? ('oauth' as const) : ('api_key' as const),
                expiresAtMs: 'expiresAt' in result ? result.expiresAt : null,
            };
        }
        throw new ServiceAccessError('unauthenticated');
    };

const isLoopbackHost = (host: string | undefined) => {
    if (!host) {
        return false;
    }
    try {
        const url = new URL(`http://${host}`);
        return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.host === host;
    } catch {
        return false;
    }
};
const authorizeInternalRequest = async (
    internal:
        | Pick<
              ReturnType<typeof createCloudflareAccessRequest<RankWranglerServicePrincipal>>,
              'authorize'
          >
        | undefined,
    input: { method?: string; url?: string; assertion?: string; userIdHeader?: string | string[] }
) => {
    if (
        !internal ||
        input.method !== 'POST' ||
        input.url !== INTERNAL_PRODUCT_PATH ||
        !input.assertion ||
        typeof input.userIdHeader !== 'string'
    ) {
        throw new ServiceAccessError('unauthenticated');
    }
    const result = await internal.authorize({
        assertion: input.assertion,
        kind: 'internal',
        route: INTERNAL_PRODUCT_ROUTE,
        userIdHeader: input.userIdHeader,
    });
    if (result.kind !== 'service_delegated') {
        throw new ServiceAccessError('unauthenticated');
    }
    return { ...result, credentialKind: 'service_delegated' as const, expiresAtMs: null };
};
