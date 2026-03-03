import { z } from 'zod';

export const productFacetKeys = [
    'profession',
    'hobby',
    'animal',
    'food',
    'cause',
    'identity',
    'culture',
    'holiday',
    'occasion',
    'place',
    'party-theme',
] as const;

export const productFacetKeySchema = z.enum(productFacetKeys);
export type ProductFacetKey = z.infer<typeof productFacetKeySchema>;

const facetClassificationShape: Record<
    ProductFacetKey,
    z.ZodDefault<z.ZodArray<z.ZodString>>
> = Object.fromEntries(
    productFacetKeys.map((facetKey) => [facetKey, z.array(z.string()).default([])])
) as Record<ProductFacetKey, z.ZodDefault<z.ZodArray<z.ZodString>>>;

export const productFacetClassificationSchema = z.object(
    facetClassificationShape
);

export type ProductFacetClassification = z.infer<
    typeof productFacetClassificationSchema
>;
