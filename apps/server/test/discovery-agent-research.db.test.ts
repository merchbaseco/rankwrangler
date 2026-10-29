import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createRankWranglerMcpServer } from '@/mcp/server';
import { createRankWranglerMcpDataSource } from '@/mcp/data-source';
import type { Context } from '@/api/context';
import { rankwranglerServiceAccounts } from '@/db/service-account-schema';
import { beforeEach, describe, expect, it } from 'bun:test';
import { and, sql } from 'drizzle-orm';
import { productSearchInput } from '@/api/product-search-input';
import { db } from '@/db/index';
import { products, operations } from '@/db/schema';
import { searchProducts } from '@/services/product-search';
import { productSearchFilters } from '@/db/product-search-filters';
import { productSearchSort } from '@/db/product-search-sort';
import { resetDiscoveryFixture } from './discovery-fixture';

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')(
    'agent research on a growing catalog',
    () => {
        beforeEach(resetDiscoveryFixture);
        it('screens and paginates a 100k catalog without provider fanout and uses its text index', async () => {
            await db.execute(sql`insert into products(marketplace_id,asin,title,brand,is_merch_listing,root_category_bsr,date_first_available)
            select 'ATVPDKIKX0DER','B0'||lpad(n::text,8,'0'),
                case when n%100=0 then 'Fishing dad shirt' else 'Nurse halloween shirt' end,
                'Independent Studio',true,n,'2026-10-01'::timestamp
            from generate_series(1,100000) n`);
            await db.execute(sql`analyze products`);
            const input = productSearchInput.parse({
                term: 'fishing',
                salesRank: { max: 30_000 },
                sort: 'salesRankAsc',
                limit: 50,
            });
            const samples: number[] = [];
            for (let i = 0; i < 5; i += 1) {
                const started = performance.now();
                const first = await searchProducts(input);
                samples.push(performance.now() - started);
                expect(first.items).toHaveLength(50);
                expect(first.items[0].salesRank).toBe(100);
                expect(first.items.at(-1)?.salesRank).toBe(5000);
                expect(first.coverage).toEqual({
                    keyword: 'fishing',
                    headCheckedAt: null,
                    exploration: null,
                });
            }
            const seen = new Set<string>();
            let cursor: string | null = null;
            do {
                const page = await searchProducts({ ...input, cursor });
                for (const product of page.items) {
                    expect(seen.has(product.asin)).toBe(false);
                    expect(product.salesRank! <= 30_000).toBe(true);
                    seen.add(product.asin);
                }
                cursor = page.nextCursor;
            } while (cursor);
            expect(seen.size).toBe(300);
            expect(
                (
                    await searchProducts(
                        productSearchInput.parse({ term: 'nonexistentplatypusniche' })
                    )
                ).items
            ).toEqual([]);
            expect(await db.select().from(operations)).toHaveLength(0);
            const filters = productSearchFilters(input);
            const sort = productSearchSort(input, filters.relevance);
            const query = db
                .select({ id: products.id })
                .from(products)
                .where(and(filters.where, sort.after))
                .orderBy(...sort.order)
                .limit(51);
            const plan = await db.execute(sql`explain (analyze,buffers,format json) ${query}`);
            const serialized = JSON.stringify(plan);
            expect(serialized).toContain('Index');
            console.log(
                JSON.stringify({
                    proof: '100k-local-catalog',
                    rows: 100000,
                    screened: seen.size,
                    successfulRuns: 5,
                    providerOperations: 0,
                    sampleMs: samples.map(ms => Math.round(ms)),
                    plan: JSON.parse(serialized),
                })
            );
        });
        it('runs several niche research questions through the actual MCP and public query path', async () => {
            const [account] = await db
                .insert(rankwranglerServiceAccounts)
                .values({ merchbaseUserId: 'mbu_mcp_discovery_proof' })
                .returning();
            const context: Context = {
                user: { sub: 'mbu_mcp_discovery_proof' },
                isAdmin: false,
                authType: 'access',
                credentialKind: 'oauth',
                authExpiresAtMs: null,
                accessPrincipal: { ...account, merchbaseUserId: 'mbu_mcp_discovery_proof' },
                accessError: null,
                request: { headers: {} },
            } as Context;
            await db.insert(products).values(
                ['Fishing dad shirt', 'Nurse halloween shirt', 'Hawaii Christmas shirt'].map(
                    (title, i) => ({
                        marketplaceId: 'ATVPDKIKX0DER',
                        asin: `B0TST0000${i}`,
                        title,
                        isMerchListing: true,
                        rootCategoryBsr: 100_000,
                        keepaCurrentNewPrice: 1999,
                        keepaMonthlySold: 25,
                    })
                )
            );
            const server = createRankWranglerMcpServer(createRankWranglerMcpDataSource(context));
            const client = new Client({ name: 'merch-research-proof', version: '1.0.0' });
            const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
            await server.connect(serverTransport);
            await client.connect(clientTransport);
            try {
                for (const term of ['fishing', 'nurse', 'hawaii', 'nonexistentplatypusniche']) {
                    const response = await client.callTool({
                        name: 'rankwrangler_product',
                        arguments: {
                            operation: 'search',
                            term,
                            salesRank: { max: 300_000 },
                            sort: 'salesRankAsc',
                        },
                    });
                    expect(response.isError).not.toBe(true);
                    const result = response.structuredContent as {
                        operation: string;
                        data: {
                            items: Array<{ salesRank: number; price: unknown; demand: unknown }>;
                            coverage: unknown;
                        };
                    };
                    expect(result.operation).toBe('search');
                    expect(result.data.items).toHaveLength(
                        term === 'nonexistentplatypusniche' ? 0 : 1
                    );
                    if (result.data.items.length)
                        expect(result.data.items[0]).toMatchObject({
                            salesRank: 100_000,
                            price: { amountMinor: 1999, currencyCode: 'USD' },
                            demand: { boughtInPastMonth: 25 },
                        });
                }
                expect(await db.select().from(operations)).toHaveLength(0);
                const [usage] = await db
                    .select()
                    .from(rankwranglerServiceAccounts)
                    .where(sql`id=${account.id}::uuid`);
                expect(usage.usageCount).toBe(4);
            } finally {
                await client.close();
                await server.close();
            }
        });
    }
);
