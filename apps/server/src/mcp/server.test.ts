import { describe, expect, it } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createRankWranglerMcpServer, type RankWranglerMcpDataSource } from './server';

const dataSource: RankWranglerMcpDataSource = {
    status: async () => ({
        service: 'rankwrangler',
        status: 'ready',
        capabilities: {
            product: ['get', 'getMany', 'search', 'history'],
            keyword: ['get', 'search', 'history'],
        },
    }),
    product: {
        get: async input => ({ operation: 'get', data: { asin: input.asin } }),
        getMany: async input => ({ operation: 'getMany', data: { products: input.products } }),
        search: async input => ({ operation: 'search', data: { term: input.term } }),
        history: async input => ({ operation: 'history', data: { asin: input.asin } }),
    },
    keyword: {
        get: async input => ({ operation: 'get', data: { keyword: input.keyword } }),
        search: async input => ({ operation: 'search', data: { text: input.text } }),
        history: async input => ({ operation: 'history', data: { keyword: input.keyword } }),
    },
};

describe('RankWrangler MCP server', () => {
    it('exposes only status plus the two discriminated noun tools', async () => {
        const { client, server } = await connect(dataSource);
        const result = await client.listTools();

        expect(result.tools.map(tool => tool.name)).toEqual([
            'rankwrangler_status',
            'rankwrangler_product',
            'rankwrangler_keyword',
        ]);
        expect(
            result.tools.find(tool => tool.name === 'rankwrangler_product')?.inputSchema
        ).toMatchObject({
            type: 'object',
        });
        const productTool = result.tools.find(tool => tool.name === 'rankwrangler_product');
        expect(productTool?.description).toContain('getMany uses products');
        expect(productTool?.inputSchema).toMatchObject({
            properties: {
                operation: { enum: ['get', 'getMany', 'search', 'history'] },
            },
        });
        expect(JSON.stringify(result.tools)).not.toContain('oneOf');
        expect(JSON.stringify(result.tools)).not.toContain('anyOf');
        expect(JSON.stringify(result.tools)).not.toContain('allOf');
        expect(productTool?.description).not.toContain('final');
        expect(productTool?.description).not.toContain('Keepa');
        expect(JSON.stringify(result.tools)).not.toContain('operation.get');
        expect(JSON.stringify(result.tools)).not.toContain('poll');

        await client.close();
        await server.close();
    });

    it('dispatches each noun and verb through synchronous data responses', async () => {
        const { client, server } = await connect(dataSource);

        const calls = await Promise.all([
            client.callTool({ name: 'rankwrangler_status', arguments: {} }),
            client.callTool({
                name: 'rankwrangler_product',
                arguments: { operation: 'get', asin: 'B012345678' },
            }),
            client.callTool({
                name: 'rankwrangler_product',
                arguments: {
                    operation: 'getMany',
                    products: [
                        { asin: 'b012345678', marketplaceId: 'ATVPDKIKX0DER' },
                        { asin: 'B087654321', marketplaceId: 'ATVPDKIKX0DER' },
                    ],
                },
            }),
            client.callTool({
                name: 'rankwrangler_product',
                arguments: { operation: 'search', term: 'shirts' },
            }),
            client.callTool({
                name: 'rankwrangler_product',
                arguments: { operation: 'history', asin: 'B012345678' },
            }),
            client.callTool({
                name: 'rankwrangler_keyword',
                arguments: { operation: 'get', keyword: 'shirts' },
            }),
            client.callTool({
                name: 'rankwrangler_keyword',
                arguments: { operation: 'search', text: 'shirt' },
            }),
            client.callTool({
                name: 'rankwrangler_keyword',
                arguments: { operation: 'history', keyword: 'shirts' },
            }),
        ]);

        expect(calls.every(call => call.isError !== true)).toBe(true);
        expect(calls.map(call => call.structuredContent)).toEqual([
            expect.objectContaining({ service: 'rankwrangler' }),
            { operation: 'get', data: { asin: 'B012345678' } },
            {
                operation: 'getMany',
                data: {
                    products: [
                        { asin: 'B012345678', marketplaceId: 'ATVPDKIKX0DER' },
                        { asin: 'B087654321', marketplaceId: 'ATVPDKIKX0DER' },
                    ],
                },
            },
            { operation: 'search', data: { term: 'shirts' } },
            { operation: 'history', data: { asin: 'B012345678' } },
            { operation: 'get', data: { keyword: 'shirts' } },
            { operation: 'search', data: { text: 'shirt' } },
            { operation: 'history', data: { keyword: 'shirts' } },
        ]);

        await client.close();
        await server.close();
    });

    it('returns structured invalid-input errors for missing discriminator fields', async () => {
        const { client, server } = await connect(dataSource);

        const [productResult, keywordResult] = await Promise.all([
            client.callTool({
                name: 'rankwrangler_product',
                arguments: { operation: 'get' },
            }),
            client.callTool({
                name: 'rankwrangler_keyword',
                arguments: { operation: 'search' },
            }),
        ]);

        expect(productResult).toMatchObject({
            isError: true,
            structuredContent: {
                error: {
                    code: 'INVALID_INPUT',
                    retryable: false,
                },
            },
        });
        expect(keywordResult).toMatchObject({
            isError: true,
            structuredContent: {
                error: {
                    code: 'INVALID_INPUT',
                    retryable: false,
                },
            },
        });

        await client.close();
        await server.close();
    });

    it('rejects duplicate Product pairs in getMany', async () => {
        const { client, server } = await connect(dataSource);
        const result = await client.callTool({
            name: 'rankwrangler_product',
            arguments: {
                operation: 'getMany',
                products: [
                    { asin: 'B012345678', marketplaceId: 'ATVPDKIKX0DER' },
                    { asin: 'b012345678', marketplaceId: 'ATVPDKIKX0DER' },
                ],
            },
        });

        expect(result.isError).toBe(true);
        expect(JSON.stringify(result.content)).toContain('Product pairs must be unique');

        await client.close();
        await server.close();
    });

    it('rejects removed refresh controls at the noun-tool boundary', async () => {
        const { client, server } = await connect(dataSource);

        const results = await Promise.all([
            client.callTool({
                name: 'rankwrangler_product',
                arguments: { operation: 'get', asin: 'B012345678', refresh: true },
            }),
            client.callTool({
                name: 'rankwrangler_product',
                arguments: {
                    operation: 'history',
                    asin: 'B012345678',
                    metrics: ['salesRank'],
                    refresh: true,
                },
            }),
            client.callTool({
                name: 'rankwrangler_keyword',
                arguments: { operation: 'get', keyword: 'shirts', refresh: true },
            }),
        ]);

        expect(results.every(result => result.isError === true)).toBe(true);
        expect(JSON.stringify(results)).toContain('refresh');

        await client.close();
        await server.close();
    });
});

const connect = async (source: RankWranglerMcpDataSource) => {
    const server = createRankWranglerMcpServer(source);
    const client = new Client({ name: 'rankwrangler-test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return { client, server };
};
