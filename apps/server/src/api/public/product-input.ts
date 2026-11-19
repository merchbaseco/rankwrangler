import { z } from 'zod';
import { productHistoryBuckets } from '@/services/product-history-buckets.js';

const publicProductHistoryMetrics = ['salesRank', 'price'] as const;

export const asinInput = z
    .string()
    .min(1, 'ASIN is required')
    .regex(/^[A-Z0-9]{10}$/i, 'ASIN must be 10 alphanumeric characters')
    .transform(value => value.toUpperCase());

export const productIdentityInput = z.object({
    marketplaceId: z.string().min(1, 'Marketplace ID is required'),
    asin: asinInput,
});

export const productGetManyInput = z
    .object({
        asins: z.array(asinInput).min(1).max(200),
        marketplaceId: z.string().trim().min(1).default('ATVPDKIKX0DER'),
    })
    .strict()
    .superRefine(({ asins }, context) => {
        const seen = new Set<string>();
        asins.forEach((asin, index) => {
            if (seen.has(asin)) {
                context.addIssue({
                    code: 'custom',
                    message: 'ASINs must be unique',
                    path: ['asins', index],
                });
            }
            seen.add(asin);
        });
    });

export const productSummaryInput = z.object({
    marketplaceId: z.string().min(1, 'Marketplace ID is required'),
    asin: asinInput,
    refresh: z.boolean().default(false),
});

export const productGetIncludes = ['marketData', 'shortName', 'cutoutThumbnail'] as const;
export type ProductGetInclude = (typeof productGetIncludes)[number];

/** Removed include some callers still send; accepted so they don't error, resolved to nothing. */
const legacyProductGetIncludes = ['variations'] as const;

export const productGetIncludeInput = z
    .array(z.enum([...productGetIncludes, ...legacyProductGetIncludes]))
    .max(productGetIncludes.length + legacyProductGetIncludes.length)
    .transform(values =>
        values.filter((value): value is ProductGetInclude =>
            (productGetIncludes as readonly string[]).includes(value)
        )
    );

export const productGetInput = productIdentityInput
    .extend({
        include: productGetIncludeInput.default(['marketData']),
    })
    .strict();

export const productHistoryInput = productIdentityInput
    .extend({
        bucket: z.enum(productHistoryBuckets).default('auto'),
        days: z.coerce.number().int().min(30).max(3650).default(365),
        endAt: z.coerce.date().optional(),
        limit: z.coerce.number().int().min(1).max(10_000).default(5000),
        metrics: z
            .array(z.enum(publicProductHistoryMetrics))
            .min(1)
            .max(2)
            .default([...publicProductHistoryMetrics]),
        startAt: z.coerce.date().optional(),
    })
    .strict();
