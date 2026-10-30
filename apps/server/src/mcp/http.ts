import { createOAuthBearerChallenge } from '@merchbaseco/access';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { resolveRankWranglerMcpHost } from '../services/access/request-access';
import { authenticateMcpRequest, type McpAuthDependencies } from './auth';
import { createRankWranglerMcpServer } from './server';
import type { RankWranglerMcpDataSource } from './types';

export const RANKWRANGLER_MCP_RESOURCE_URL = 'https://rankwrangler.merchbase.co/mcp';

interface RegisterMcpRoutesOptions<Principal> {
    auth: McpAuthDependencies<Principal> | null;
    createDataSource(input: {
        merchbaseUserId: string;
        principal: Principal;
    }): Promise<RankWranglerMcpDataSource> | RankWranglerMcpDataSource;
    issuer: string;
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
    for (const url of [
        '/.well-known/oauth-protected-resource',
        '/.well-known/oauth-protected-resource/mcp',
    ]) {
        fastify.get(url, { config: { cors: MCP_CORS } }, (request, reply) => {
            const host = resolveRankWranglerMcpHost({
                host: request.headers.host,
                url: request.url,
            });
            if (!host) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }
            reply.header('Cache-Control', 'public, max-age=300');
            return {
                resource: getMcpResourceUrl(host),
                authorization_servers: [options.issuer],
                bearer_methods_supported: ['header'],
            };
        });
    }

    fastify.route({
        config: { cors: MCP_CORS },
        handler: async (request, reply) => {
            const host = resolveRankWranglerMcpHost({
                host: request.headers.host,
                url: request.url,
            });
            if (!host || request.headers['x-merchbase-user-id'] !== undefined) {
                await reply.code(401).send({ error: 'Unauthorized' });
                return;
            }
            if (!isAllowedMcpOrigin(request.headers.origin)) {
                await reply.code(403).send({ error: 'Invalid Origin' });
                return;
            }

            const protectedResourceUrl = getProtectedResourceUrl(getMcpResourceUrl(host));
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
            return handleMcpRequest(request, reply, source, auth.authInfo);
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
    const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
    });

    const close = async () => {
        await transport.close();
        await server.close();
    };
    reply.raw.once('close', () => {
        close().catch(() => {
            request.log.error('Failed to close RankWrangler MCP request');
        });
    });

    try {
        await server.connect(transport);
        const response = await transport.handleRequest(createMcpWebRequest(request), {
            authInfo,
            parsedBody: request.body,
        });
        return reply.send(response);
    } catch {
        request.log.error('Failed to handle RankWrangler MCP request');
        if (!reply.raw.headersSent) {
            return reply.code(500).send({
                error: {
                    code: -32_603,
                    message: 'Internal server error',
                },
                id: null,
                jsonrpc: '2.0',
            });
        }
    }
};

const createMcpWebRequest = (request: FastifyRequest) => {
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
        if (typeof value === 'string') {
            headers.set(name, value);
        } else if (Array.isArray(value)) {
            headers.set(name, value.join(', '));
        }
    }

    return new Request(new URL(request.url, `http://${request.headers.host}`), {
        headers,
        method: request.method,
    });
};

type RankWranglerMcpHost = Exclude<ReturnType<typeof resolveRankWranglerMcpHost>, null>;

const getMcpResourceUrl = (host: RankWranglerMcpHost) =>
    host === 'rankwrangler.merchbase.co' ? RANKWRANGLER_MCP_RESOURCE_URL : `https://${host}/mcp`;

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
