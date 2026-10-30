import { afterEach, describe, expect, it } from 'bun:test';
import Fastify from 'fastify';
import type { McpAuthDependencies } from './auth';
import { registerRankWranglerMcpRoutes } from './http';
import type { RankWranglerMcpDataSource } from './types';

const issuer = 'https://thearcade.cloudflareaccess.com';

describe('RankWrangler hosted MCP HTTP routes', () => {
    const apps: ReturnType<typeof Fastify>[] = [];

    afterEach(async () => {
        await Promise.all(apps.splice(0).map(app => app.close()));
    });

    it('publishes protected-resource metadata for the canonical MCP URL', async () => {
        const app = await createApp();
        const response = await app.inject({
            headers: { host: 'rankwrangler.merchbase.co' },
            method: 'GET',
            url: '/.well-known/oauth-protected-resource/mcp',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            authorization_servers: [issuer],
            resource: 'https://rankwrangler.merchbase.co/mcp',
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

    it('publishes metadata and OAuth challenges for the requested canonical or alias host', async () => {
        const app = await createApp();
        for (const host of ['rankwrangler.merchbase.co', 'rankwrangler-api.merchbase.co']) {
            for (const url of [
                '/.well-known/oauth-protected-resource',
                '/.well-known/oauth-protected-resource/mcp',
            ]) {
                const response = await app.inject({ headers: { host }, method: 'GET', url });
                expect(response.statusCode).toBe(200);
                expect(response.json().resource).toBe(`https://${host}/mcp`);
                expect(response.json().authorization_servers).toEqual([issuer]);
            }

            const challenge = await app.inject({
                headers: { host },
                method: 'POST',
                payload: initializePayload(),
                url: '/mcp',
            });
            expect(challenge.statusCode).toBe(401);
            expect(challenge.headers['www-authenticate']).toContain(
                `resource_metadata="https://${host}/.well-known/oauth-protected-resource/mcp"`
            );
        }
    });

    it('accepts native MCP POSTs without Origin on the canonical and alias hosts', async () => {
        const authorize = async () => ({
            merchbaseUserId: 'mbu_test',
            principal: { id: 'principal_test' },
        });
        const app = await createApp({ authorize });

        for (const host of ['rankwrangler.merchbase.co', 'rankwrangler-api.merchbase.co']) {
            const response = await app.inject({
                headers: {
                    accept: 'application/json, text/event-stream',
                    'cf-access-jwt-assertion': 'origin-assertion',
                    host,
                },
                method: 'POST',
                payload: initializePayload(),
                url: '/mcp',
            });
            expect(response.statusCode).toBe(200);
        }
    });

    it('rejects an untrusted raw Host even when X-Forwarded-Host is canonical', async () => {
        const app = await createApp();
        const response = await app.inject({
            headers: {
                host: 'attacker.example',
                'x-forwarded-host': 'rankwrangler.merchbase.co',
            },
            method: 'POST',
            payload: initializePayload(),
            url: '/mcp',
        });

        expect(response.statusCode).toBe(401);
        const metadata = await app.inject({
            headers: { host: 'attacker.example' },
            method: 'GET',
            url: '/.well-known/oauth-protected-resource/mcp',
        });
        expect(metadata.statusCode).toBe(401);
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
            headers: {
                host: 'rankwrangler.merchbase.co',
                origin: 'http://attacker.example',
            },
            method: 'POST',
            payload: initializePayload(),
            url: '/mcp',
        });

        expect(response.statusCode).toBe(403);
        expect(response.json()).toEqual({ error: 'Invalid Origin' });
    });

    const createApp = async (auth?: McpAuthDependencies<{ id: string }>) => {
        const app = Fastify();
        apps.push(app);
        await registerRankWranglerMcpRoutes(app, {
            auth: auth ?? {
                authorize: () =>
                    Promise.reject(new Error('Authentication should stop before authorization.')),
            },
            createDataSource: () => mcpDataSource,
            issuer,
        });
        return app;
    };
});

const mcpDataSource: RankWranglerMcpDataSource = {
    status: async () => ({
        service: 'rankwrangler',
        status: 'ready',
        capabilities: {
            product: ['get', 'getMany', 'search', 'history'],
            keyword: ['get', 'search', 'results'],
        },
    }),
    product: {
        get: async input => ({ operation: 'get', data: { asin: input.asin } }),
        getMany: async input => ({ operation: 'getMany', data: { products: input.products } }),
        search: async input => ({ operation: 'search', data: { term: input.term } }),
        history: async input => ({ operation: 'history', data: { asin: input.asin } }),
    },
    keyword: {
        results: async input => ({ operation: 'results', data: { term: input.term } }),
        get: async input => ({ operation: 'get', data: { keyword: input.keyword } }),
        search: async input => ({ operation: 'search', data: { text: input.text } }),
    },
};

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
