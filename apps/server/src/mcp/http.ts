import type { IncomingMessage } from 'node:http';
import { createOAuthBearerChallenge } from '@merchbaseco/access';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticateMcpRequest, type McpAuthDependencies } from './auth';
import { createRankWranglerMcpServer } from './server';
import type { RankWranglerMcpDataSource } from './types';

export const RANKWRANGLER_MCP_RESOURCE_URL = 'https://rankwrangler-api.merchbase.co/mcp';

interface RegisterMcpRoutesOptions<Principal> {
    auth: McpAuthDependencies<Principal> | null;
    createDataSource(input: {
        merchbaseUserId: string;
        principal: Principal;
    }): Promise<RankWranglerMcpDataSource> | RankWranglerMcpDataSource;
    issuer: string;
    resourceUrl: string;
}

const MCP_CORS = {
    allowedHeaders: [
        'Authorization',
        'Content-Type',
        'Last-Event-ID',
        'Mcp-Protocol-Version',
        'Mcp-Session-Id',
    ],
    exposedHeaders: ['Mcp-Session-Id', 'WWW-Authenticate'],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    origin: true,
};

export const registerRankWranglerMcpRoutes = <Principal>(
    fastify: FastifyInstance,
    options: RegisterMcpRoutesOptions<Principal>
) => {
    const protectedResourceUrl = getProtectedResourceUrl(options.resourceUrl);

    for (const url of [
        '/.well-known/oauth-protected-resource',
        '/.well-known/oauth-protected-resource/mcp',
    ]) {
        fastify.get(url, { config: { cors: MCP_CORS } }, (_, reply) => {
            reply.header('Cache-Control', 'public, max-age=300');
            return {
                resource: options.resourceUrl,
                authorization_servers: [options.issuer],
                bearer_methods_supported: ['header'],
            };
        });
    }

    fastify.route({
        config: { cors: MCP_CORS },
        handler: async (request, reply) => {
            if (!isAllowedMcpOrigin(request.headers.origin)) {
                await reply.code(403).send({ error: 'Invalid Origin' });
                return;
            }

            if (
                request.headers.host !== 'rankwrangler-api.merchbase.co' ||
                request.headers['x-merchbase-user-id'] !== undefined
            ) {
                await reply.code(401).send({ error: 'Unauthorized' });
                return;
            }
            const auth = await authenticateMcpRequest(
                request.headers['cf-access-jwt-assertion'],
                options.auth
            );
            if (auth.status === 'unavailable') {
                await reply
                    .code(503)
                    .send({ error: 'RankWrangler MCP authentication is temporarily unavailable.' });
                return;
            }
            if (auth.status === 'unauthorized') {
                reply.header('WWW-Authenticate', createBearerChallenge(protectedResourceUrl));
                await reply.code(401).send({ error: 'Unauthorized' });
                return;
            }
            if (auth.status === 'forbidden') {
                reply.header('WWW-Authenticate', createBearerChallenge(protectedResourceUrl, true));
                await reply.code(403).send({
                    error: 'Insufficient scope',
                    missingScopes: auth.missingScopes,
                });
                return;
            }

            const source = await options.createDataSource({
                merchbaseUserId: auth.merchbaseUserId,
                principal: auth.principal,
            });
            await handleMcpRequest(request, reply, source, auth.authInfo);
        },
        method: ['GET', 'POST', 'DELETE'],
        url: '/mcp',
    });
};

const handleMcpRequest = async (
    request: FastifyRequest,
    reply: FastifyReply,
    source: RankWranglerMcpDataSource,
    authInfo: AuthInfo
) => {
    const server = createRankWranglerMcpServer(source);
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
    });
    const rawRequest = request.raw as IncomingMessage & { auth?: AuthInfo };
    rawRequest.auth = authInfo;
    reply.hijack();

    const close = async () => {
        await transport.close();
        await server.close();
    };
    reply.raw.once('close', () => {
        close().catch(() => undefined);
    });

    try {
        await server.connect(transport);
        await transport.handleRequest(rawRequest, reply.raw, request.body);
    } catch {
        if (!reply.raw.headersSent) {
            reply.raw.writeHead(500, {
                'Content-Type': 'application/json',
            });
            reply.raw.end(
                JSON.stringify({
                    error: {
                        code: -32_603,
                        message: 'Internal server error',
                    },
                    id: null,
                    jsonrpc: '2.0',
                })
            );
        }
    }
};

const getProtectedResourceUrl = (resourceUrl: string) => {
    const url = new URL(resourceUrl);
    return `${url.origin}/.well-known/oauth-protected-resource${url.pathname}`;
};

const createBearerChallenge = (resourceMetadataUrl: string, insufficientScope = false) =>
    `Bearer realm="RankWrangler", ${createOAuthBearerChallenge({
        insufficientScope,
        resourceMetadataUrl,
    }).slice('Bearer '.length)}`;

const isAllowedMcpOrigin = (origin: string | undefined) => {
    if (!origin) {
        return true;
    }

    try {
        const url = new URL(origin);
        return (
            url.protocol === 'https:' ||
            (url.protocol === 'http:' &&
                (url.hostname === 'localhost' || url.hostname === '127.0.0.1'))
        );
    } catch {
        return false;
    }
};
