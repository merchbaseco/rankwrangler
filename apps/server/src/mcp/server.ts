import { keywordDirectoryInput } from '@/api/keyword-directory-input';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { rejectFieldsOutsideOperation } from './input-refinements';
import {
    productInputSchema,
    toProductGetInput,
    toProductGetManyInput,
    toProductHistoryInput,
    toProductSearchInput,
} from './product-input';
import { readOnlyToolAnnotations, runReadOnlyTool } from './tool-result';
import type { RankWranglerMcpDataSource } from './types';

export type { RankWranglerMcpDataSource } from './types';

const RANKWRANGLER_WEBSITE_URL = 'https://rankwrangler.merchbase.co';
const RANKWRANGLER_ICON_URL = `${RANKWRANGLER_WEBSITE_URL}/icon.png`;

export const RANKWRANGLER_MCP_SERVER_INFO = {
    name: 'rankwrangler',
    title: 'RankWrangler',
    version: '0.6.0',
    websiteUrl: RANKWRANGLER_WEBSITE_URL,
    icons: [{ src: RANKWRANGLER_ICON_URL, mimeType: 'image/png', sizes: ['128x128'] }],
};

const toolOutputSchema = z.object({
    data: z.unknown().optional(),
    error: z
        .object({
            code: z.string(),
            message: z.string(),
            retryable: z.boolean(),
            retryAfterSeconds: z.number().int().positive().optional(),
        })
        .optional(),
    operation: z.enum(['get', 'getMany', 'search', 'history', 'results']).optional(),
});

const keywordInputSchema = z
    .object({
        cursor: keywordDirectoryInput.shape.cursor,
        sort: keywordDirectoryInput.shape.sort.removeDefault().optional(),
        keyword: z.string().trim().min(1).max(200).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        operation: z.enum(['get', 'search', 'results']),
        stage: keywordDirectoryInput.shape.stage.removeDefault().optional(),
        freshness: keywordDirectoryInput.shape.freshness.removeDefault().optional(),
        heat: keywordDirectoryInput.shape.heat.removeDefault().optional(),
        term: z.string().trim().min(1).max(200).optional(),
        refresh: z.boolean().optional(),
        text: z.string().trim().min(1).max(200).optional(),
    })
    .strict()
    .superRefine((input, context) =>
        rejectFieldsOutsideOperation(input, context, {
            get: ['keyword'],
            results: ['term', 'refresh'],
            search: ['cursor', 'limit', 'text', 'stage', 'freshness', 'heat', 'sort'],
        })
    );

const statusOutputSchema = z.object({
    capabilities: z.object({
        keyword: z.array(z.enum(['get', 'search', 'results'])),
        product: z.array(z.enum(['get', 'getMany', 'search', 'history'])),
    }),
    service: z.literal('rankwrangler'),
    status: z.literal('ready'),
});

export const createRankWranglerMcpServer = (source: RankWranglerMcpDataSource) => {
    const server = new McpServer(RANKWRANGLER_MCP_SERVER_INFO);

    server.registerTool(
        'rankwrangler_status',
        {
            annotations: readOnlyToolAnnotations,
            description:
                'Read RankWrangler readiness and supported Product and keyword capabilities. This tool does not expose provider status or start work.',
            inputSchema: z.object({}).strict(),
            outputSchema: statusOutputSchema,
            title: 'RankWrangler status',
        },
        async () => runReadOnlyTool(async () => source.status())
    );

    server.registerTool(
        'rankwrangler_product',
        {
            annotations: readOnlyToolAnnotations,
            description:
                'Read RankWrangler Product data synchronously. operation=get uses asin and ' +
                'marketplaceId and accepts include=[marketData,shortName,cutoutThumbnail]. ' +
                'get waits up to 20s for requested shortName/cutoutThumbnail generation; a field ' +
                'still generating or failed at that deadline returns as none (shortName null, ' +
                'cutoutThumbnail {status:unavailable}) and a later get returns it, so never ' +
                'retry get just for enrichment. ' +
                'getMany uses products and returns fixed-shape basic title and ' +
                'thumbnail data for up to 200 identities without include; request ' +
                'shortName or cutoutThumbnail with get. get and getMany return a known ' +
                "Product's last-known listing data at once and refresh it in the background; " +
                'they wait only for Products RankWrangler has never resolved. In getMany results, ' +
                'amazonListingStatus is active or deleted. active means the Amazon detail-page ' +
                'listing exists, not that an offer is in stock or buyable. deleted means the ' +
                'listing no longer exists for customers in that marketplace; retained title or ' +
                'thumbnail values are last-known data. An unavailable thumbnail alone does not ' +
                'mean the Product is deleted. ' +
                'search immediately screens the collected catalog using optional term, textFields, ' +
                'excludeWords, marketplaceIds, isMerchListing, amazonListingStatus, brands, ' +
                'excludeBrands, includeOfficialBrands, categoryIds, salesRank, price, monthlySold, ' +
                'firstAvailableAt, discoveredAt, updatedAt, facets, sort, cursor and limit (1–100). ' +
                'Price bounds use minor currency units. Search returns items, nextCursor and dated ' +
                'keyword coverage; it never waits for collection. Use keyword results for dated ' +
                'Amazon search placements. history uses asin plus range options. Responses contain data or ' +
                'a standard error.',
            inputSchema: productInputSchema,
            outputSchema: toolOutputSchema,
            title: 'RankWrangler Product',
        },
        input => {
            switch (input.operation) {
                case 'get':
                    return runReadOnlyTool(async () =>
                        source.product.get(toProductGetInput(input))
                    );
                case 'getMany':
                    return runReadOnlyTool(async () =>
                        source.product.getMany(toProductGetManyInput(input))
                    );
                case 'search':
                    return runReadOnlyTool(async () =>
                        source.product.search(toProductSearchInput(input))
                    );
                case 'history':
                    return runReadOnlyTool(async () =>
                        source.product.history(toProductHistoryInput(input))
                    );
                default:
                    return assertNever(input.operation);
            }
        }
    );

    server.registerTool(
        'rankwrangler_keyword',
        {
            annotations: readOnlyToolAnnotations,
            description:
                'Read RankWrangler keyword data synchronously. operation=get reads a keyword directory entry; search filters our stored keyword directory using text, stage (default graduated; trial, dropped, untracked or all), freshness (live, needsSync, syncing or all), heat, limit and an opaque nextCursor. These reads show each keyword stage, data freshness, popularity and refresh cadence. results uses term and optional refresh to fetch or reuse dated Amazon search evidence, returning keyword, searchedAt and results with placements. It may wait for collection and normally reuses evidence for 24 hours. Responses contain data or a standard error.',
            inputSchema: keywordInputSchema,
            outputSchema: toolOutputSchema,
            title: 'RankWrangler keyword',
        },
        input => {
            switch (input.operation) {
                case 'results':
                    return runReadOnlyTool(async () =>
                        source.keyword.results({
                            term: requireValue(input.term, 'term'),
                            refresh: input.refresh ?? false,
                        })
                    );
                case 'get':
                    return runReadOnlyTool(async () =>
                        source.keyword.get({
                            keyword: requireValue(input.keyword, 'keyword'),
                        })
                    );
                case 'search':
                    return runReadOnlyTool(async () =>
                        source.keyword.search({
                            cursor: input.cursor,
                            sort: input.sort,
                            stage: input.stage,
                            freshness: input.freshness,
                            heat: input.heat,
                            limit: input.limit ?? 25,
                            text: requireValue(input.text, 'text'),
                        })
                    );
                default:
                    return assertNever(input.operation);
            }
        }
    );

    return server;
};

const requireValue = <Value>(value: Value | undefined, name: string): Value => {
    if (value === undefined) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `${name} is required.`,
        });
    }
    return value;
};

const assertNever = (value: never): never => {
    throw new Error(`Unsupported MCP operation: ${value}`);
};
