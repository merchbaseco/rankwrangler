import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { readOnlyToolAnnotations, runReadOnlyTool } from './tool-result';
import type {
    ProductGetManyMcpInput,
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
    operation: z.enum(['get', 'getMany', 'search', 'history']).optional(),
});

const productIdentitySchema = z
    .object({
        asin: z
            .string()
            .trim()
            .regex(/^[A-Z0-9]{10}$/i),
        marketplaceId: z.string().trim().min(1),
    })
    .strict();

const productBatchSchema = z
    .array(productIdentitySchema)
    .min(1)
    .max(200)
    .superRefine((products, context) => {
        const identities = new Set<string>();
        products.forEach((product, index) => {
            const key = `${product.marketplaceId}:${product.asin.toUpperCase()}`;
            if (identities.has(key)) {
                context.addIssue({
                    code: 'custom',
                    message: 'Product pairs must be unique',
                    path: [index],
                });
            }
            identities.add(key);
        });
    });

const productInputSchema = z
    .object({
        asin: z.string().trim().min(1).max(10).optional(),
        bucket: z.enum(['auto', 'day', 'week', 'month']).optional(),
        days: z.number().int().min(30).max(3650).optional(),
        endAt: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(10_000).optional(),
        marketplaceId: z.string().trim().min(1).optional(),
        metrics: z.array(z.enum(['salesRank', 'price'])).min(1).max(2).optional(),
        operation: z.enum(['get', 'getMany', 'search', 'history']),
        products: productBatchSchema.optional(),
        refresh: z.boolean().optional(),
        startAt: z.string().datetime().optional(),
        term: z.string().trim().min(1).max(200).optional(),
    })
    .strict()
    .superRefine((input, context) =>
        rejectFieldsOutsideOperation(input, context, {
            get: ['asin', 'marketplaceId'],
            getMany: ['products'],
            history: [
                'asin',
                'bucket',
                'days',
                'endAt',
                'limit',
                'marketplaceId',
                'metrics',
                'startAt',
            ],
            search: ['refresh', 'term'],
        })
    );

const keywordInputSchema = z
    .object({
        cursor: z.number().int().min(0).optional(),
        keyword: z.string().trim().min(1).max(200).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        marketplaceId: z.literal('ATVPDKIKX0DER').optional(),
        operation: z.enum(['get', 'search', 'history']),
        rangeDays: z.number().int().min(7).max(365).optional(),
        text: z.string().trim().min(1).max(200).optional(),
    })
    .strict()
    .superRefine((input, context) =>
        rejectFieldsOutsideOperation(input, context, {
            get: ['keyword', 'marketplaceId'],
            history: ['keyword', 'marketplaceId', 'rangeDays'],
            search: ['cursor', 'limit', 'marketplaceId', 'text'],
        })
    );

const statusOutputSchema = z.object({
    capabilities: z.object({
        keyword: z.array(z.enum(['get', 'search', 'history'])),
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
                'marketplaceId; getMany uses products and returns fixed-shape basic title and ' +
                'thumbnail data for up to 200 identities. In getMany results, ' +
                'isUnavailable=true means the Amazon listing is effectively deleted and no longer ' +
                'available for customers to purchase; retained title or thumbnail values are ' +
                'last-known data. An unavailable thumbnail alone does not mean the Product is ' +
                'unavailable. ' +
                'search uses term; history uses asin plus range options. Responses contain data or ' +
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
                        source.product.search({
                            refresh: input.refresh ?? false,
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
                'Read RankWrangler keyword data synchronously. operation=get and history use keyword; search uses text. Responses contain data or a standard error.',
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
                            marketplaceId: input.marketplaceId ?? 'ATVPDKIKX0DER',
                        })
                    );
                case 'search':
                    return runReadOnlyTool(async () =>
                        source.keyword.search({
                            cursor: input.cursor ?? 0,
                            limit: input.limit ?? 25,
                            marketplaceId: input.marketplaceId ?? 'ATVPDKIKX0DER',
                            text: requireValue(input.text, 'text'),
                        })
                    );
                case 'history':
                    return runReadOnlyTool(async () =>
                        source.keyword.history({
                            keyword: requireValue(input.keyword, 'keyword'),
                            marketplaceId: input.marketplaceId ?? 'ATVPDKIKX0DER',
                            rangeDays: input.rangeDays ?? 90,
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

const toProductGetInput = (input: ProductInput): ProductGetMcpInput => ({
    asin: requireValue(input.asin, 'asin'),
    marketplaceId: input.marketplaceId ?? 'ATVPDKIKX0DER',
});

const toProductGetManyInput = (input: ProductInput): ProductGetManyMcpInput => ({
    products: requireValue(input.products, 'products').map(product => ({
        asin: product.asin.toUpperCase(),
        marketplaceId: product.marketplaceId,
    })),
});

const toProductHistoryInput = (input: ProductInput): ProductHistoryMcpInput => ({
    asin: requireValue(input.asin, 'asin'),
    bucket: input.bucket ?? 'auto',
    days: input.days ?? 365,
    endAt: input.endAt,
    limit: input.limit ?? 5000,
    marketplaceId: input.marketplaceId ?? 'ATVPDKIKX0DER',
    metrics: input.metrics ?? ['salesRank', 'price'],
    startAt: input.startAt,
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

const rejectFieldsOutsideOperation = <Operation extends string>(
    input: { operation: Operation } & Record<string, unknown>,
    context: z.RefinementCtx,
    fieldsByOperation: Record<Operation, string[]>
) => {
    const allowedFields = new Set(['operation', ...fieldsByOperation[input.operation]]);
    for (const [field, value] of Object.entries(input)) {
        if (value !== undefined && !allowedFields.has(field)) {
            context.addIssue({
                code: 'custom',
                message: `${field} is not accepted for ${input.operation}`,
                path: [field],
            });
        }
    }
};

const assertNever = (value: never): never => {
    throw new Error(`Unsupported MCP operation: ${value}`);
};
