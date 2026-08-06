import type { FastifyInstance } from 'fastify';
import type { Context } from '@/api/context';
import type { RankWranglerAccess } from '@/services/access/rankwrangler-access';
import { createRankWranglerMcpDataSource } from './data-source';
import { RANKWRANGLER_MCP_RESOURCE_URL, registerRankWranglerMcpRoutes } from './http';

interface RegisterRankWranglerMcpOptions {
    adminMerchbaseUserId?: string;
    fastify: FastifyInstance;
    access: RankWranglerAccess;
    publishableKey?: string;
}

export const registerRankWranglerMcp = ({
    access,
    adminMerchbaseUserId,
    fastify,
    publishableKey,
}: RegisterRankWranglerMcpOptions) => {
    registerRankWranglerMcpRoutes(fastify, {
        auth: {
            authorize: token => access.oauthAccess.authorize(token),
        },
        createDataSource: ({ merchbaseUserId, principal }) =>
            createRankWranglerMcpDataSource({
                user: { sub: merchbaseUserId },
                isAdmin: merchbaseUserId === adminMerchbaseUserId,
                authType: 'access',
                credentialKind: 'oauth',
                authExpiresAtMs: null,
                accessPrincipal: principal,
                accessError: null,
                request: { headers: {} },
            } as Context),
        publishableKey,
        resourceUrl: RANKWRANGLER_MCP_RESOURCE_URL,
    });
};
