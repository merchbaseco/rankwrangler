import { keywordDirectoryInput } from '@/api/keyword-directory-input';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { rejectFieldsOutsideOperation, unknownFieldError } from './input-refinements';
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
    version: '0.7.0',
    websiteUrl: RANKWRANGLER_WEBSITE_URL,
    icons: [{ src: RANKWRANGLER_ICON_URL, mimeType: 'image/png', sizes: ['128x128'] }],
};

const PRODUCT_TOOL_DESCRIPTION = [
    'Read RankWrangler Product data. Responses contain data or a standard error.',
    'operation=search is the niche scan: it screens the collected Merch catalog for Products',
    'whose title matches term (titles only; brand and bullets never match) and returns items,',
    'nextCursor and dated keyword coverage. Optional filters: excludeWords (title words),',
    'marketplaceId (default ATVPDKIKX0DER), isMerchListing, amazonListingStatus, brands,',
    'excludeBrands, includeOfficialBrands, categoryIds, salesRank, price (minor currency units),',
    'boughtInPastMonth, firstAvailableAt, discoveredAt, updatedAt, facets; plus sort, cursor and',
    'limit (1-100). The default sort is estimatedMonthlySalesDesc (the larger of',
    'estimatedMonthlySales and boughtInPastMonth, so strong sellers without a badge still rank);',
    'others are relevance (keywordPosition, then title match), salesRankAsc/Desc,',
    'boughtInPastMonthDesc, priceAsc/Desc, firstAvailableAtAsc/Desc, updatedAtAsc/Desc and',
    'discoveredAtDesc. A first page that finds nothing for a term Amazon was never searched for',
    'waits while RankWrangler collects that search, then answers. contactSheet=true adds one',
    'JPEG image of the returned items in order, each labelled with its 1-based index in items.',
    'Each item is flat: asin, title, brand, bullet1, bullet2, imageUrl, salesRank (current BSR),',
    'salesRankAverages, salesRankDrops, boughtInPastMonth, estimatedMonthlySales, keywordPosition,',
    'price and dates. boughtInPastMonth is Amazon\'s bucketed "bought in past month" badge (50,',
    '100, 200, ... 1K+); null means no badge was observed, not zero sales. estimatedMonthlySales is',
    'an order-of-magnitude estimate from sales rank, never a count. keywordPosition is the',
    "Product's last observed position (1-20) in Amazon's search results for exactly that term;",
    'null when it was not in them.',
    'operation=get uses asin and marketplaceId and accepts include=[marketData,shortName,',
    'cutoutThumbnail]; it waits up to 20s for requested shortName/cutoutThumbnail generation, and',
    'a field still generating then returns as none (shortName null, cutoutThumbnail',
    '{status:unavailable}) for a later get to fill, so never retry get just for enrichment.',
    'operation=getMany uses asins (1-200 unique ASINs) and optional marketplaceId and returns',
    'title, imageUrl and amazonListingStatus each. get and getMany return a known Product\'s',
    'last-known listing data at once and refresh it in the background; they wait only for',
    'Products RankWrangler has never resolved. amazonListingStatus is active or deleted: active',
    'means the Amazon detail page exists, not that an offer is in stock or buyable; deleted means',
    'the listing no longer exists for customers, and retained title or image values are',
    'last-known data. A missing image alone does not mean the Product is deleted.',
    'operation=history uses asin plus range options (startAt, endAt, days, bucket, metrics, limit).',
].join(' ');

const KEYWORD_TOOL_DESCRIPTION = [
    'Read RankWrangler keyword data. Responses contain data or a standard error.',
    'operation=get reads one keyword directory entry by keyword. operation=list filters the',
    'stored keyword directory by term with stage (default graduated; trial, dropped, untracked or',
    'all), freshness (live, needsSync, syncing or all), heat, sort, limit and an opaque cursor.',
    'Entries show each keyword stage, data freshness, popularity and refresh cadence. For the',
    'Products in a niche, use rankwrangler_product search with the same term.',
].join(' ');

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
    operation: z.enum(['get', 'getMany', 'search', 'history', 'list']).optional(),
});

const keywordFieldsByOperation = {
    get: ['keyword'],
    list: ['cursor', 'limit', 'term', 'stage', 'freshness', 'heat', 'sort'],
} as const;

const keywordInputSchema = z
    .strictObject(
        {
            cursor: keywordDirectoryInput.shape.cursor,
            sort: keywordDirectoryInput.shape.sort.removeDefault().optional(),
            keyword: z.string().trim().min(1).max(200).optional(),
            limit: z.number().int().min(1).max(100).optional(),
            operation: z.enum(['get', 'list']),
            stage: keywordDirectoryInput.shape.stage.removeDefault().optional(),
            freshness: keywordDirectoryInput.shape.freshness.removeDefault().optional(),
            heat: keywordDirectoryInput.shape.heat.removeDefault().optional(),
            term: z.string().trim().min(1).max(200).optional(),
        },
        { error: unknownFieldError(keywordFieldsByOperation) }
    )
    .superRefine((input, context) =>
        rejectFieldsOutsideOperation(input, context, keywordFieldsByOperation)
    );

const statusOutputSchema = z.object({
    capabilities: z.object({
        keyword: z.array(z.enum(['get', 'list'])),
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
            description: PRODUCT_TOOL_DESCRIPTION,
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
                    return runReadOnlyTool(
                        async () => source.product.search(toProductSearchInput(input)),
                        input.contactSheet
                            ? result => source.product.contactSheet(searchImageUrls(result))
                            : undefined
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
            description: KEYWORD_TOOL_DESCRIPTION,
            inputSchema: keywordInputSchema,
            outputSchema: toolOutputSchema,
            title: 'RankWrangler keyword',
        },
        input => {
            switch (input.operation) {
                case 'get':
                    return runReadOnlyTool(async () =>
                        source.keyword.get({
                            keyword: requireValue(input.keyword, 'keyword'),
                        })
                    );
                case 'list':
                    return runReadOnlyTool(async () =>
                        source.keyword.list({
                            cursor: input.cursor,
                            sort: input.sort,
                            stage: input.stage,
                            freshness: input.freshness,
                            heat: input.heat,
                            limit: input.limit ?? 25,
                            term: requireValue(input.term, 'term'),
                        })
                    );
                default:
                    return assertNever(input.operation);
            }
        }
    );

    return server;
};

const searchImageUrls = (result: Record<string, unknown>) =>
    searchItemImages.safeParse(result).data?.data.items.map(item => item.imageUrl) ?? [];

const searchItemImages = z.object({
    data: z.object({ items: z.array(z.object({ imageUrl: z.string().nullable() })) }),
});

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
