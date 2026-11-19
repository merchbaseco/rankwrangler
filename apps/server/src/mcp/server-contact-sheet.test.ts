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

describe('RankWrangler MCP contact sheet', () => {
    it('attaches a contact sheet image only when search asks for one', async () => {
        const sheets: Array<ReadonlyArray<string | null>> = [];
        const { client, server } = await connect({
            ...dataSource,
            product: {
                ...dataSource.product,
                search: async () => ({
                    operation: 'search',
                    data: {
                        items: [
                            { imageUrl: 'https://m.media-amazon.com/a.jpg' },
                            { imageUrl: null },
                        ],
                    },
                }),
                contactSheet: async urls => {
                    sheets.push(urls);
                    return { data: 'c2hlZXQ=', mimeType: 'image/jpeg' };
                },
            },
        });

        const [withSheet, withoutSheet] = await Promise.all([
            client.callTool({
                name: 'rankwrangler_product',
                arguments: { operation: 'search', term: 'bruh', contactSheet: true },
            }),
            client.callTool({
                name: 'rankwrangler_product',
                arguments: { operation: 'search', term: 'bruh' },
            }),
        ]);

        expect(sheets).toEqual([['https://m.media-amazon.com/a.jpg', null]]);
        expect((withSheet.content as Array<{ type: string }>).map(block => block.type)).toEqual([
            'text',
            'image',
        ]);
        expect((withSheet.content as unknown[])[1]).toEqual({
            type: 'image',
            data: 'c2hlZXQ=',
            mimeType: 'image/jpeg',
        });
        expect((withoutSheet.content as Array<{ type: string }>).map(block => block.type)).toEqual([
            'text',
        ]);
        await client.close();
        await server.close();
    });

    it('returns the search when its contact sheet fails', async () => {
        const { client, server } = await connect({
            ...dataSource,
            product: {
                ...dataSource.product,
                contactSheet: async () => {
                    throw new Error('sharp exploded');
                },
            },
        });

        const result = await client.callTool({
            name: 'rankwrangler_product',
            arguments: { operation: 'search', term: 'bruh', contactSheet: true },
        });

        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toEqual({ operation: 'search', data: { term: 'bruh' } });
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
