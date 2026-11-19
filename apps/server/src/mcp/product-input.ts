import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { productSearchInput } from '@/api/product-search-input';
import { productGetIncludeInput, productGetManyInput } from '@/api/public/product-input';
import { rejectFieldsOutsideOperation, unknownFieldError } from './input-refinements';
import type { ProductGetManyMcpInput, ProductGetMcpInput, ProductHistoryMcpInput } from './types';

const optionalSearchField = <Schema extends z.ZodType>(schema: Schema) =>
    z.optional(schema instanceof z.ZodDefault ? schema.removeDefault() : schema);

const searchShape = {
    updatedAt: optionalSearchField(productSearchInput.shape.updatedAt),
    term: optionalSearchField(productSearchInput.shape.term),
    excludeWords: optionalSearchField(productSearchInput.shape.excludeWords),
    isMerchListing: optionalSearchField(productSearchInput.shape.isMerchListing),
    amazonListingStatus: optionalSearchField(productSearchInput.shape.amazonListingStatus),
    brands: optionalSearchField(productSearchInput.shape.brands),
    excludeBrands: optionalSearchField(productSearchInput.shape.excludeBrands),
    includeOfficialBrands: optionalSearchField(productSearchInput.shape.includeOfficialBrands),
    categoryIds: optionalSearchField(productSearchInput.shape.categoryIds),
    salesRank: optionalSearchField(productSearchInput.shape.salesRank),
    price: optionalSearchField(productSearchInput.shape.price),
    boughtInPastMonth: optionalSearchField(productSearchInput.shape.boughtInPastMonth),
    firstAvailableAt: optionalSearchField(productSearchInput.shape.firstAvailableAt),
    discoveredAt: optionalSearchField(productSearchInput.shape.discoveredAt),
    facets: optionalSearchField(productSearchInput.shape.facets),
    sort: optionalSearchField(productSearchInput.shape.sort),
    cursor: optionalSearchField(productSearchInput.shape.cursor),
} satisfies Record<
    Exclude<keyof typeof productSearchInput.shape, 'limit' | 'marketplaceId'>,
    z.ZodType
>;

const fieldsByOperation = {
    get: ['asin', 'include', 'marketplaceId'],
    getMany: ['asins', 'marketplaceId'],
    history: ['asin', 'bucket', 'days', 'endAt', 'limit', 'marketplaceId', 'metrics', 'startAt'],
    search: [...Object.keys(productSearchInput.shape), 'contactSheet'],
} as const;

export const productInputSchema = z
    .strictObject(
        {
            ...searchShape,
            asin: z.string().trim().min(1).max(10).optional(),
            asins: z
                .array(
                    z
                        .string()
                        .trim()
                        .regex(/^[A-Z0-9]{10}$/i)
                )
                .min(1)
                .max(200)
                .optional(),
            bucket: z.enum(['auto', 'day', 'week', 'month']).optional(),
            contactSheet: z.boolean().optional(),
            days: z.number().int().min(30).max(3650).optional(),
            endAt: z.string().datetime().optional(),
            include: productGetIncludeInput.optional(),
            limit: z.number().int().min(1).max(10_000).optional(),
            marketplaceId: z.string().trim().min(1).optional(),
            metrics: z
                .array(z.enum(['salesRank', 'price']))
                .min(1)
                .max(2)
                .optional(),
            operation: z.enum(['get', 'getMany', 'search', 'history']),
            startAt: z.string().datetime().optional(),
        },
        { error: unknownFieldError(fieldsByOperation) }
    )
    .superRefine((input, context) => {
        rejectFieldsOutsideOperation(input, context, fieldsByOperation);
        // The public procedures' own rules (range order, unique ASINs) apply here too, so they
        // surface as input errors before any read.
        const parsed =
            input.operation === 'search'
                ? productSearchInput.safeParse(input)
                : input.operation === 'getMany' && input.asins
                  ? productGetManyInput.safeParse({
                        asins: input.asins,
                        marketplaceId: input.marketplaceId,
                    })
                  : null;
        for (const issue of parsed?.success === false ? parsed.error.issues : []) {
            context.addIssue({ code: 'custom', message: issue.message, path: issue.path });
        }
    });

type ProductInput = z.infer<typeof productInputSchema>;

export const toProductGetInput = (input: ProductInput): ProductGetMcpInput => ({
    asin: requireValue(input.asin, 'asin'),
    marketplaceId: input.marketplaceId ?? 'ATVPDKIKX0DER',
    ...(input.include ? { include: input.include } : {}),
});

export const toProductGetManyInput = (input: ProductInput): ProductGetManyMcpInput => ({
    asins: requireValue(input.asins, 'asins').map(asin => asin.toUpperCase()),
    marketplaceId: input.marketplaceId ?? 'ATVPDKIKX0DER',
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

export const toProductSearchInput = ({ contactSheet: _contactSheet, ...input }: ProductInput) =>
    productSearchInput.parse(input);

const requireValue = <Value>(value: Value | undefined, name: string): Value => {
    if (value === undefined) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `${name} is required.`,
        });
    }
    return value;
};
