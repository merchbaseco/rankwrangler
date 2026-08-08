import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { readOnlyToolAnnotations, runReadOnlyTool } from './tool-result';
import type {
    ProductGetMcpInput,
    ProductHistoryMcpInput,
    RankWranglerMcpDataSource,
} from './types';

export type { RankWranglerMcpDataSource } from './types';

export const RANKWRANGLER_MCP_SERVER_INFO = {
    name: 'rankwrangler',
    title: 'RankWrangler',
    version: '0.6.0',
} as const;

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
    operation: z.enum(['get', 'search', 'history']).optional(),
});

const productInputSchema = z.discriminatedUnion('operation', [
    z
        .object({
            asin: z.string().trim().min(1).max(10).optional(),
            marketplaceId: z.string().trim().min(1).default('ATVPDKIKX0DER'),
            operation: z.literal('get'),
        })
        .strict(),
    z
        .object({
            operation: z.literal('search'),
            refresh: z.boolean().default(false),
            term: z.string().trim().min(1).max(200),
        })
        .strict(),
    z
        .object({
            asin: z.string().trim().min(1).max(10).optional(),
            bucket: z.enum(['auto', 'day', 'week', 'month']).default('auto'),
            days: z.number().int().min(30).max(3650).default(365),
            endAt: z.string().datetime().optional(),
            limit: z.number().int().min(1).max(10_000).default(5000),
            marketplaceId: z.string().trim().min(1).default('ATVPDKIKX0DER'),
            metrics: z
                .array(z.enum(['salesRank', 'price']))
                .min(1)
                .max(2)
                .default(['salesRank', 'price']),
            operation: z.literal('history'),
            startAt: z.string().datetime().optional(),
        })
        .strict(),
]);

const keywordInputSchema = z.discriminatedUnion('operation', [
    z
        .object({
            keyword: z.string().trim().min(1).max(200).optional(),
            marketplaceId: z.literal('ATVPDKIKX0DER').default('ATVPDKIKX0DER'),
            operation: z.literal('get'),
        })
        .strict(),
    z
        .object({
            cursor: z.number().int().min(0).default(0),
            limit: z.number().int().min(1).max(100).default(25),
            marketplaceId: z.literal('ATVPDKIKX0DER').default('ATVPDKIKX0DER'),
            operation: z.literal('search'),
            text: z.string().trim().min(1).max(200).optional(),
        })
        .strict(),
    z
        .object({
            keyword: z.string().trim().min(1).max(200).optional(),
            marketplaceId: z.literal('ATVPDKIKX0DER').default('ATVPDKIKX0DER'),
            operation: z.literal('history'),
            rangeDays: z.number().int().min(7).max(365).default(90),
        })
        .strict(),
]);

const statusOutputSchema = z.object({
    capabilities: z.object({
        keyword: z.array(z.enum(['get', 'search', 'history'])),
        product: z.array(z.enum(['get', 'search', 'history'])),
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
                'Read RankWrangler readiness and final Product and keyword data capabilities. This tool does not expose provider status or start work.',
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
                'Read Product data using one final synchronous operation: get, search, or history. The response contains final data or a standard error.',
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
                case 'search':
                    return runReadOnlyTool(async () =>
                        source.product.search({
                            refresh: input.refresh,
                            term: input.term,
                        })
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
                'Read keyword data using one final synchronous operation: get, search, or history. The response contains final data or a standard error.',
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
                            marketplaceId: input.marketplaceId,
                        })
                    );
                case 'search':
                    return runReadOnlyTool(async () =>
                        source.keyword.search({
                            cursor: input.cursor,
                            limit: input.limit,
                            marketplaceId: input.marketplaceId,
                            text: requireValue(input.text, 'text'),
                        })
                    );
                case 'history':
                    return runReadOnlyTool(async () =>
                        source.keyword.history({
                            keyword: requireValue(input.keyword, 'keyword'),
                            marketplaceId: input.marketplaceId,
                            rangeDays: input.rangeDays,
                        })
                    );
                default:
                    return assertNever(input.operation);
            }
        }
    );

    return server;
};

type ProductInput = z.infer<typeof productInputSchema>;
type ProductGetInput = Extract<ProductInput, { operation: 'get' }>;
type ProductHistoryInput = Extract<ProductInput, { operation: 'history' }>;

const toProductGetInput = (input: ProductGetInput): ProductGetMcpInput => ({
    asin: requireValue(input.asin, 'asin'),
    marketplaceId: input.marketplaceId,
});

const toProductHistoryInput = (input: ProductHistoryInput): ProductHistoryMcpInput => ({
    asin: requireValue(input.asin, 'asin'),
    bucket: input.bucket,
    days: input.days,
    endAt: input.endAt,
    limit: input.limit,
    marketplaceId: input.marketplaceId,
    metrics: input.metrics,
    startAt: input.startAt,
});

const requireValue = (value: string | undefined, name: string) => {
    if (!value) {
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
