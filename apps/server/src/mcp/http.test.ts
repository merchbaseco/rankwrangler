import { afterEach, describe, expect, it } from 'bun:test';
import Fastify from 'fastify';
import { registerRankWranglerMcpRoutes } from './http';

const resourceUrl = 'https://rankwrangler-api.merchbase.co/mcp';
const issuer = 'https://thearcade.cloudflareaccess.com';

describe('RankWrangler hosted MCP HTTP routes', () => {
    const apps: ReturnType<typeof Fastify>[] = [];

    afterEach(async () => {
        await Promise.all(apps.splice(0).map(app => app.close()));
    });

    it('publishes protected-resource metadata for the canonical MCP URL', async () => {
        const app = await createApp();
        const response = await app.inject({
            method: 'GET',
            url: '/.well-known/oauth-protected-resource/mcp',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            authorization_servers: [issuer],
            resource: resourceUrl,
        });
    });

    it('returns OAuth discovery metadata when the MCP caller is unauthenticated', async () => {
        const app = await createApp();
        const response = await app.inject({
            headers: { host: 'rankwrangler-api.merchbase.co' },
            method: 'POST',
            payload: initializePayload(),
            url: '/mcp',
        });

        expect(response.statusCode).toBe(401);
        expect(response.headers['www-authenticate']).toBe(
            'Bearer realm="RankWrangler", resource_metadata="https://rankwrangler-api.merchbase.co/.well-known/oauth-protected-resource/mcp"'
        );
    });

    it('returns neutral temporary unavailability when the OAuth backend fails', async () => {
        const app = await createApp();
        const response = await app.inject({
            headers: {
                host: 'rankwrangler-api.merchbase.co',
                'cf-access-jwt-assertion': 'origin-assertion',
            },
            method: 'POST',
            payload: initializePayload(),
            url: '/mcp',
        });

        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({
            error: 'RankWrangler MCP authentication is temporarily unavailable.',
        });
    });

    it('rejects insecure remote origins before authentication', async () => {
        const app = await createApp();
        const response = await app.inject({
            headers: { origin: 'http://attacker.example' },
            method: 'POST',
            payload: initializePayload(),
            url: '/mcp',
        });

        expect(response.statusCode).toBe(403);
        expect(response.json()).toEqual({ error: 'Invalid Origin' });
    });

    const createApp = async () => {
        const app = Fastify();
        apps.push(app);
        await registerRankWranglerMcpRoutes(app, {
            auth: {
                authorize: () =>
                    Promise.reject(new Error('Authentication should stop before authorization.')),
            },
            createDataSource: () =>
                Promise.reject(new Error('Authentication should stop before data access.')),
            issuer,
            resourceUrl,
        });
        return app;
    };
});

const initializePayload = () => ({
    id: 1,
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
        protocolVersion: '2025-06-18',
    },
});
