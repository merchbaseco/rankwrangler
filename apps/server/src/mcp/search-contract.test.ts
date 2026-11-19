import { describe, expect, it } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createRankWranglerMcpServer } from './server';
import { RANKWRANGLER_MCP_STATUS, type RankWranglerMcpDataSource } from './types';

const source: RankWranglerMcpDataSource = {
    status: async () => RANKWRANGLER_MCP_STATUS,
    product: {
        history: async input => ({ data: input }),
        get: async input => ({ data: input }),
        getMany: async input => ({ data: input }),
        search: async input => ({ data: input }),
        contactSheet: async () => null,
    },
    keyword: {
        get: async input => ({ data: input }),
        list: async input => ({ data: input }),
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
                    marketplaceId: 'A1F83G8C2ARO7P',
                    isMerchListing: 'all',
                    boughtInPastMonth: { min: 100 },
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
                    marketplaceId: 'A1F83G8C2ARO7P',
                    isMerchListing: 'all',
                    boughtInPastMonth: { min: 100 },
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

    it('allows browsing without a term, sorted by estimated monthly sales by default', async () => {
        const { client, server } = await connect();
        try {
            const result = await client.callTool({
                name: 'rankwrangler_product',
                arguments: { operation: 'search' },
            });
            expect(result.isError).not.toBe(true);
            expect(result.structuredContent).toMatchObject({
                data: {
                    limit: 50,
                    isMerchListing: true,
                    marketplaceId: 'ATVPDKIKX0DER',
                    sort: 'estimatedMonthlySalesDesc',
                },
            });
            const status = await client.callTool({ name: 'rankwrangler_status', arguments: {} });
            expect(status.structuredContent).toMatchObject({
                capabilities: { keyword: ['get', 'list'] },
            });
        } finally {
            await Promise.all([client.close(), server.close()]);
        }
    });

    it('lists keywords by term', async () => {
        const { client, server } = await connect();
        try {
            const result = await client.callTool({
                name: 'rankwrangler_keyword',
                arguments: { operation: 'list', term: 'fishing shirt', stage: 'all' },
            });
            expect(result.isError).not.toBe(true);
            expect(result.structuredContent).toEqual({
                data: {
                    term: 'fishing shirt',
                    stage: 'all',
                    limit: 25,
                    cursor: undefined,
                    sort: undefined,
                    freshness: undefined,
                    heat: undefined,
                },
            });
        } finally {
            await Promise.all([client.close(), server.close()]);
        }
    });

    it('names the right field for old, misplaced and guessed field names', async () => {
        const { client, server } = await connect();
        try {
            const cases = [
                [
                    'rankwrangler_product',
                    { operation: 'search', term: 'bruh', marketplaceIds: ['ATVPDKIKX0DER'] },
                    'marketplaceIds is not a recognized field; use marketplaceId',
                ],
                [
                    'rankwrangler_product',
                    { operation: 'search', query: 'bruh' },
                    'query is not a recognized field; use term',
                ],
                [
                    'rankwrangler_product',
                    { operation: 'search', monthlySold: { min: 50 } },
                    'monthlySold is not a recognized field; use boughtInPastMonth',
                ],
                [
                    'rankwrangler_product',
                    { operation: 'getMany', products: [{ asin: 'B012345678' }] },
                    'products is not a recognized field; use asins',
                ],
                [
                    'rankwrangler_product',
                    { operation: 'getMany', asin: 'B012345678' },
                    'asin is not accepted for getMany; use asins',
                ],
                [
                    'rankwrangler_keyword',
                    { operation: 'list', text: 'bruh' },
                    'text is not a recognized field; use term',
                ],
                [
                    'rankwrangler_keyword',
                    { operation: 'list', keyword: 'bruh' },
                    'keyword is not accepted for list; use term',
                ],
                ['rankwrangler_keyword', { operation: 'results', term: 'bruh' }, 'Invalid option'],
            ] as const;
            for (const [name, args, message] of cases) {
                const result = await client.callTool({ name, arguments: args });
                expect(result.isError).toBe(true);
                expect(contentText(result)).toContain(message);
            }
            const unrelated = await client.callTool({
                name: 'rankwrangler_product',
                arguments: { operation: 'search', colour: 'red' },
            });
            expect(contentText(unrelated)).toContain('colour is not a recognized field');
            expect(contentText(unrelated)).not.toContain('; use');
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

const contentText = (result: Awaited<ReturnType<Client['callTool']>>) =>
    (result.content as Array<{ text?: string }>).map(block => block.text ?? '').join('\n');

const connect = async () => {
    const server = createRankWranglerMcpServer(source);
    const client = new Client({ name: 'search-contract-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return { client, server };
};
