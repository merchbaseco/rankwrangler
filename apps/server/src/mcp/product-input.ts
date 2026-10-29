import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { productSearchInput } from '@/api/product-search-input';
import { productGetIncludes } from '@/api/public/product-input';
import { rejectFieldsOutsideOperation } from './input-refinements';
import type { ProductGetManyMcpInput, ProductGetMcpInput, ProductHistoryMcpInput } from './types';

const optionalSearchField = <Schema extends z.ZodType>(schema: Schema) =>
    z.optional(schema instanceof z.ZodDefault ? schema.removeDefault() : schema);

const searchShape = {
    marketplaceIds: optionalSearchField(productSearchInput.shape.marketplaceIds),
    updatedAt: optionalSearchField(productSearchInput.shape.updatedAt),
    term: optionalSearchField(productSearchInput.shape.term),
    textFields: optionalSearchField(productSearchInput.shape.textFields),
    excludeWords: optionalSearchField(productSearchInput.shape.excludeWords),
    isMerchListing: optionalSearchField(productSearchInput.shape.isMerchListing),
    amazonListingStatus: optionalSearchField(productSearchInput.shape.amazonListingStatus),
    brands: optionalSearchField(productSearchInput.shape.brands),
    excludeBrands: optionalSearchField(productSearchInput.shape.excludeBrands),
    includeOfficialBrands: optionalSearchField(productSearchInput.shape.includeOfficialBrands),
    categoryIds: optionalSearchField(productSearchInput.shape.categoryIds),
    salesRank: optionalSearchField(productSearchInput.shape.salesRank),
    price: optionalSearchField(productSearchInput.shape.price),
    monthlySold: optionalSearchField(productSearchInput.shape.monthlySold),
    firstAvailableAt: optionalSearchField(productSearchInput.shape.firstAvailableAt),
    discoveredAt: optionalSearchField(productSearchInput.shape.discoveredAt),
    facets: optionalSearchField(productSearchInput.shape.facets),
    sort: optionalSearchField(productSearchInput.shape.sort),
    cursor: optionalSearchField(productSearchInput.shape.cursor),
} satisfies Record<Exclude<keyof typeof productSearchInput.shape, 'limit'>, z.ZodType>;

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

export const productInputSchema = z
    .object({
        ...searchShape,
        asin: z.string().trim().min(1).max(10).optional(),
        bucket: z.enum(['auto', 'day', 'week', 'month']).optional(),
        days: z.number().int().min(30).max(3650).optional(),
        endAt: z.string().datetime().optional(),
        include: z.array(z.enum(productGetIncludes)).max(productGetIncludes.length).optional(),
        limit: z.number().int().min(1).max(10_000).optional(),
        marketplaceId: z.string().trim().min(1).optional(),
        metrics: z
            .array(z.enum(['salesRank', 'price']))
            .min(1)
            .max(2)
            .optional(),
        operation: z.enum(['get', 'getMany', 'search', 'history']),
        products: productBatchSchema.optional(),
        startAt: z.string().datetime().optional(),
    })
    .strict()
    .superRefine((input, context) => {
        rejectFieldsOutsideOperation(input, context, {
            get: ['asin', 'include', 'marketplaceId'],
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
            search: Object.keys(productSearchInput.shape),
        });
        if (input.operation === 'search') {
            const parsed = productSearchInput.safeParse(input);
            if (!parsed.success) {
                for (const issue of parsed.error.issues) {
                    context.addIssue({ code: 'custom', message: issue.message, path: issue.path });
                }
            }
        }
    });

type ProductInput = z.infer<typeof productInputSchema>;

export const toProductGetInput = (input: ProductInput): ProductGetMcpInput => ({
    asin: requireValue(input.asin, 'asin'),
    marketplaceId: input.marketplaceId ?? 'ATVPDKIKX0DER',
    ...(input.include ? { include: input.include } : {}),
});

export const toProductGetManyInput = (input: ProductInput): ProductGetManyMcpInput => ({
    products: requireValue(input.products, 'products').map(product => ({
        asin: product.asin.toUpperCase(),
        marketplaceId: product.marketplaceId,
    })),
});

export const toProductHistoryInput = (input: ProductInput): ProductHistoryMcpInput => ({
    asin: requireValue(input.asin, 'asin'),
    bucket: input.bucket ?? 'auto',
    days: input.days ?? 365,
    endAt: input.endAt,
    limit: input.limit ?? 5000,
    marketplaceId: input.marketplaceId ?? 'ATVPDKIKX0DER',
    metrics: input.metrics ?? ['salesRank', 'price'],
    startAt: input.startAt,
});

export const toProductSearchInput = (input: ProductInput) => productSearchInput.parse(input);

const requireValue = <Value>(value: Value | undefined, name: string): Value => {
    if (value === undefined) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `${name} is required.`,
        });
    }
    return value;
};
