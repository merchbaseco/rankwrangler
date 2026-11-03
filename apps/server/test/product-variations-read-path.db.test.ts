import { afterEach, describe, expect, it, mock } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { and, eq, like } from 'drizzle-orm';
import { db } from '@/db/index';
import { productVariations } from '@/db/product-variation-schema';
import {
    claimVariationFetch,
    failVariationFetch,
    finishVariationFetch,
    lookupVariationsByMember,
} from '@/db/product/product-variation-store';
import { getProductVariations } from '@/services/product-variations';
import { classifyStoredVariations } from '@/services/product-variations-request';

const MARKETPLACE = 'ATVPDKIKX0DER';
const PARENT = 'B0VARREADP1';
const CHILD_A = 'B0VARREADC1';
const CHILD_B = 'B0VARREADC2';
const describeCatalogDb =
    process.env.RUN_CATALOG_DB_TESTS === 'true' &&
    process.env.RANKWRANGLER_DATABASE_NAME === 'rankwrangler_catalog_test'
        ? describe
        : describe.skip;

describeCatalogDb('product_variations read path', () => {
    afterEach(async () => {
        mock.restore();
        await db
            .delete(productVariations)
            .where(
                and(
                    eq(productVariations.marketplaceId, MARKETPLACE),
                    like(productVariations.parentAsin, 'B0VARREAD%')
                )
            );
    });

    it('returns a ready family through classify and getProductVariations without Catalog', async () => {
        const claimId = randomUUID();
        expect(
            await claimVariationFetch({
                marketplaceId: MARKETPLACE,
                parentAsin: PARENT,
                claimId,
            })
        ).toBe(true);
        expect(
            await finishVariationFetch({
                marketplaceId: MARKETPLACE,
                parentAsin: PARENT,
                claimId,
                resolution: {
                    kind: 'family',
                    theme: ['color', 'size'],
                    children: [
                        { asin: CHILD_A, attributes: { color: 'Black', size: 'L' } },
                        { asin: CHILD_B, attributes: { color: 'White', size: 'M' } },
                    ],
                },
            })
        ).toBe(true);

        const rows = await lookupVariationsByMember(MARKETPLACE, CHILD_A);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.attemptedAt).toBeInstanceOf(Date);
        expect(rows[0]?.fetchedAt).toBeInstanceOf(Date);
        expect(Array.isArray(rows[0]?.theme)).toBe(true);
        expect(Array.isArray(rows[0]?.children)).toBe(true);

        const classified = classifyStoredVariations(rows, CHILD_A);
        expect(classified.state).toBe('ready');
        if (classified.state !== 'ready') {
            return;
        }
        expect(classified.value).toMatchObject({
            parentAsin: PARENT,
            theme: ['color', 'size'],
            defaultChildAsin: CHILD_A,
            children: [
                { asin: CHILD_A, attributes: { color: 'Black', size: 'L' } },
                { asin: CHILD_B, attributes: { color: 'White', size: 'M' } },
            ],
        });
        expect(classified.value?.fetchedAt).toEqual(expect.any(String));

        const searchCatalogItemsByAsins = mock(async () => {
            throw new Error('Catalog must not run for a fresh ready family.');
        });
        const result = await getProductVariations(
            { marketplaceId: MARKETPLACE, asin: CHILD_A, timeoutMs: 2_000 },
            { searchCatalogItemsByAsins }
        );
        expect(result?.parentAsin).toBe(PARENT);
        expect(result?.children.map(child => child.asin)).toEqual([CHILD_A, CHILD_B]);
        expect(searchCatalogItemsByAsins).not.toHaveBeenCalled();
    });

    it('classifies fresh error rows as failed and pending rows as missing', async () => {
        const errorClaimId = randomUUID();
        expect(
            await claimVariationFetch({
                marketplaceId: MARKETPLACE,
                parentAsin: PARENT,
                claimId: errorClaimId,
            })
        ).toBe(true);
        await failVariationFetch({
            marketplaceId: MARKETPLACE,
            parentAsin: PARENT,
            claimId: errorClaimId,
        });

        const errorRows = await lookupVariationsByMember(MARKETPLACE, PARENT);
        expect(errorRows[0]?.state).toBe('error');
        expect(errorRows[0]?.attemptedAt).toBeInstanceOf(Date);
        expect(errorRows[0]?.fetchedAt).toBeNull();
        expect(classifyStoredVariations(errorRows, PARENT).state).toBe('failed');

        await db
            .delete(productVariations)
            .where(
                and(
                    eq(productVariations.marketplaceId, MARKETPLACE),
                    eq(productVariations.parentAsin, PARENT)
                )
            );

        const pendingClaimId = randomUUID();
        expect(
            await claimVariationFetch({
                marketplaceId: MARKETPLACE,
                parentAsin: PARENT,
                claimId: pendingClaimId,
            })
        ).toBe(true);
        const pendingRows = await lookupVariationsByMember(MARKETPLACE, PARENT);
        expect(pendingRows[0]?.state).toBe('pending');
        expect(pendingRows[0]?.attemptedAt).toBeInstanceOf(Date);
        expect(classifyStoredVariations(pendingRows, PARENT)).toEqual({
            state: 'missing',
            parentAsin: PARENT,
        });
    });
});
