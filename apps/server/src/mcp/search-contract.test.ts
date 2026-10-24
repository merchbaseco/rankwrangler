import { describe, expect, it } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createRankWranglerMcpServer } from './server';
import { RANKWRANGLER_MCP_STATUS, type RankWranglerMcpDataSource } from './types';

const source: RankWranglerMcpDataSource = {
    status: async () => RANKWRANGLER_MCP_STATUS,
    product: {
        get: async input => ({ data: input }),
        getMany: async input => ({ data: input }),
        history: async input => ({ data: input }),
        search: async input => ({ data: input }),
    },
    keyword: {
        get: async input => ({ data: input }),
        search: async input => ({ data: input }),
        history: async input => ({ data: input }),
        results: async input => ({ data: input }),
    },
};

describe('MCP catalog search and keyword evidence', () => {
    it('forwards catalog filters and cursor with shared API defaults', async () => {
        const { client, server } = await connect();
        try {
            const result = await client.callTool({
                name: 'rankwrangler_product',
                arguments: {
                    operation: 'search',
                    term: ' fishing ',
                    textFields: 'title',
                    marketplaceIds: [],
                    isMerchListing: 'all',
                    salesRank: { max: 300_000 },
                    firstAvailableAt: { after: '2026-07-23' },
                    updatedAt: { before: '2026-10-23' },
                    sort: 'firstAvailableAtAsc',
                    cursor: 'next-page',
                    limit: 25,
                },
            });
            expect(result.isError).not.toBe(true);
            expect(result.structuredContent).toEqual({
                data: {
                    term: 'fishing',
                    textFields: 'title',
                    marketplaceIds: [],
                    isMerchListing: 'all',
                    salesRank: { max: 300_000 },
                    firstAvailableAt: { after: '2026-07-23' },
                    updatedAt: { before: '2026-10-23' },
                    sort: 'firstAvailableAtAsc',
                    cursor: 'next-page',
                    limit: 25,
                    excludeWords: [],
                    amazonListingStatus: 'active',
                    brands: [],
                    excludeBrands: [],
                    includeOfficialBrands: false,
                    categoryIds: [],
                    facets: [],
                },
            });
        } finally {
            await Promise.all([client.close(), server.close()]);
        }
    });

    it('allows browsing without a term and advertises keyword results', async () => {
        const { client, server } = await connect();
        try {
            const result = await client.callTool({
                name: 'rankwrangler_product',
                arguments: { operation: 'search' },
            });
            expect(result.isError).not.toBe(true);
            expect(result.structuredContent).toMatchObject({
                data: { limit: 50, isMerchListing: true, marketplaceIds: ['ATVPDKIKX0DER'] },
            });
            const status = await client.callTool({ name: 'rankwrangler_status', arguments: {} });
            expect(status.structuredContent).toMatchObject({
                capabilities: { keyword: ['get', 'search', 'history', 'results'] },
            });
        } finally {
            await Promise.all([client.close(), server.close()]);
        }
    });

    it('routes dated search evidence through keyword results with refresh', async () => {
        const { client, server } = await connect();
        try {
            const result = await client.callTool({
                name: 'rankwrangler_keyword',
                arguments: { operation: 'results', term: 'fishing shirt', refresh: true },
            });
            expect(result.isError).not.toBe(true);
            expect(result.structuredContent).toEqual({
                data: { term: 'fishing shirt', refresh: true },
            });
        } finally {
            await Promise.all([client.close(), server.close()]);
        }
    });

    it('rejects refresh on catalog search and validates operation-specific ranges and limits', async () => {
        const { client, server } = await connect();
        try {
            const inputs = [
                { operation: 'search', refresh: true },
                { operation: 'search', limit: 101 },
                { operation: 'search', salesRank: { min: 100, max: 50 } },
                {
                    operation: 'search',
                    firstAvailableAt: { after: '2026-10-23', before: '2026-01-01' },
                },
                { operation: 'get', asin: 'B012345678', includeOfficialBrands: true },
            ];
            for (const input of inputs) {
                const result = await client.callTool({
                    name: 'rankwrangler_product',
                    arguments: input,
                });
                expect(result.isError).toBe(true);
            }
            const history = await client.callTool({
                name: 'rankwrangler_product',
                arguments: { operation: 'history', asin: 'B012345678', limit: 5000 },
            });
            expect(history.isError).not.toBe(true);
            expect(history.structuredContent).toMatchObject({ data: { limit: 5000 } });
        } finally {
            await Promise.all([client.close(), server.close()]);
        }
    });
});

const connect = async () => {
    const server = createRankWranglerMcpServer(source);
    const client = new Client({ name: 'search-contract-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return { client, server };
};
