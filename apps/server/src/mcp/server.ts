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

const productInputSchema = z
    .object({
        asin: z.string().trim().min(1).max(10).optional(),
        bucket: z.enum(['auto', 'day', 'week', 'month']).default('auto'),
        days: z.number().int().min(30).max(3650).default(365),
        endAt: z.string().datetime().optional(),
        format: z.enum(['agent', 'legacy']).default('agent'),
        limit: z.number().int().min(1).max(10_000).default(5000),
        marketplaceId: z.string().trim().min(1).default('ATVPDKIKX0DER'),
        metrics: z
            .array(z.enum(['bsr', 'price']))
            .min(1)
            .max(2)
            .optional(),
        operation: z.enum(['get', 'search', 'history']),
        refresh: z.boolean().default(false),
        startAt: z.string().datetime().optional(),
        term: z.string().trim().min(1).max(200).optional(),
    })
    .strict();

const keywordInputSchema = z
    .object({
        cursor: z.number().int().min(0).default(0),
        keyword: z.string().trim().min(1).max(200).optional(),
        limit: z.number().int().min(1).max(100).default(25),
        marketplaceId: z.literal('ATVPDKIKX0DER').default('ATVPDKIKX0DER'),
        operation: z.enum(['get', 'search', 'history']),
        rangeDays: z.number().int().min(7).max(365).default(90),
        refresh: z.boolean().default(false),
        text: z.string().trim().min(1).max(200).optional(),
    })
    .strict();

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
                            term: requireValue(input.term, 'term'),
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
                            refresh: input.refresh,
                        })
                    );
                case 'search':
                    return runReadOnlyTool(async () =>
                        source.keyword.search({
                            cursor: input.cursor,
                            limit: input.limit,
                            marketplaceId: input.marketplaceId,
                            refresh: input.refresh,
                            text: requireValue(input.text, 'text'),
                        })
                    );
                case 'history':
                    return runReadOnlyTool(async () =>
                        source.keyword.history({
                            keyword: requireValue(input.keyword, 'keyword'),
                            marketplaceId: input.marketplaceId,
                            rangeDays: input.rangeDays,
                            refresh: input.refresh,
                        })
                    );
                default:
                    return assertNever(input.operation);
            }
        }
    );

    return server;
};

const toProductGetInput = (input: z.infer<typeof productInputSchema>): ProductGetMcpInput => ({
    asin: requireValue(input.asin, 'asin'),
    bucket: input.bucket,
    days: input.days,
    endAt: input.endAt,
    limit: input.limit,
    marketplaceId: input.marketplaceId,
    metrics: input.metrics,
    refresh: input.refresh,
    startAt: input.startAt,
});

const toProductHistoryInput = (
    input: z.infer<typeof productInputSchema>
): ProductHistoryMcpInput => ({
    ...toProductGetInput(input),
    format: input.format,
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
