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
            keyword: ['get', 'list'],
        },
    }),
    product: {
        get: async input => ({ operation: 'get', data: { asin: input.asin } }),
        getMany: async input => ({ operation: 'getMany', data: input }),
        search: async input => ({ operation: 'search', data: { term: input.term } }),
        history: async input => ({ operation: 'history', data: { asin: input.asin } }),
        contactSheet: async () => null,
    },
    keyword: {
        get: async input => ({ operation: 'get', data: { keyword: input.keyword } }),
        list: async input => ({ operation: 'list', data: { term: input.term } }),
    },
};

describe('RankWrangler MCP server', () => {
    it('advertises the website and a resolvable icon in server info', async () => {
        const { client, server } = await connect(dataSource);

        expect(client.getServerVersion()).toMatchObject({
            name: 'rankwrangler',
            title: 'RankWrangler',
            websiteUrl: 'https://rankwrangler.merchbase.co',
            icons: [
                {
                    src: 'https://rankwrangler.merchbase.co/icon.png',
                    mimeType: 'image/png',
                    sizes: ['128x128'],
                },
            ],
        });

        await Promise.all([client.close(), server.close()]);
    });

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
        expect(productTool?.description).toContain('getMany uses asins');
        expect(productTool?.description).toContain('default sort is estimatedMonthlySalesDesc');
        expect(productTool?.description).toContain('amazonListingStatus is active or deleted');
        expect(productTool?.description).toContain('deleted means the listing no longer exists');
        expect(productTool?.description).toContain('not that an offer is in stock or buyable');
        expect(productTool?.description).toContain('last-known data');
        expect(productTool?.inputSchema).toMatchObject({
            properties: {
                operation: { enum: ['get', 'getMany', 'search', 'history'] },
            },
        });
        for (const tool of result.tools) {
            expect(tool.inputSchema).not.toHaveProperty('oneOf');
            expect(tool.inputSchema).not.toHaveProperty('anyOf');
            expect(tool.inputSchema).not.toHaveProperty('allOf');
        }
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
                arguments: { operation: 'getMany', asins: ['b012345678', 'B087654321'] },
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
                arguments: { operation: 'list', term: 'shirt' },
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
                        { marketplaceId: 'ATVPDKIKX0DER', asin: 'B012345678' },
                        { marketplaceId: 'ATVPDKIKX0DER', asin: 'B087654321' },
                    ],
                },
            },
            { operation: 'search', data: { term: 'shirts' } },
            { operation: 'history', data: { asin: 'B012345678' } },
            { operation: 'get', data: { keyword: 'shirts' } },
            { operation: 'list', data: { term: 'shirt' } },
        ]);

        await client.close();
        await server.close();
    });

    it('forwards the short-name opt-in only for Product get', async () => {
        const { client, server } = await connect({
            ...dataSource,
            product: { ...dataSource.product, get: async input => ({ data: input }) },
        });
        const result = await client.callTool({
            name: 'rankwrangler_product',
            arguments: { operation: 'get', asin: 'B012345678', include: ['shortName'] },
        });

        expect(result.structuredContent).toMatchObject({
            data: { asin: 'B012345678', include: ['shortName'] },
        });
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
                arguments: { operation: 'list' },
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

    it('rejects duplicate ASINs in getMany', async () => {
        const { client, server } = await connect(dataSource);
        const result = await client.callTool({
            name: 'rankwrangler_product',
            arguments: { operation: 'getMany', asins: ['B012345678', 'b012345678'] },
        });

        expect(result.isError).toBe(true);
        expect(JSON.stringify(result.content)).toContain('ASINs must be unique');

        await client.close();
        await server.close();
    });

    it('rejects include for getMany', async () => {
        const { client, server } = await connect(dataSource);

        const result = await client.callTool({
            name: 'rankwrangler_product',
            arguments: {
                operation: 'getMany',
                asins: ['B012345678'],
                include: ['shortName'],
            },
        });

        expect(result.isError).toBe(true);
        expect(JSON.stringify(result.content)).toContain('include is not accepted for getMany');

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
