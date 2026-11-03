import { afterEach, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { and, eq, like, or } from 'drizzle-orm';
import { db } from '@/db/index';
import { productVariations } from '@/db/product-variation-schema';
import {
    claimVariationFetch,
    finishVariationFetch,
    getStoredVariation,
    lookupVariationsByMember,
} from '@/db/product/product-variation-store';

const MARKETPLACE = 'ATVPDKIKX0DER';
const PARENT = 'B0VARPARENT';
const OTHER_PARENT = 'B0VAROTHER1';
const CHILD_COUNT = 303;
const describeCatalogDb =
    process.env.RUN_CATALOG_DB_TESTS === 'true' &&
    process.env.RANKWRANGLER_DATABASE_NAME === 'rankwrangler_catalog_test'
        ? describe
        : describe.skip;

describeCatalogDb('product_variations store', () => {
    afterEach(async () => {
        await db
            .delete(productVariations)
            .where(
                and(
                    eq(productVariations.marketplaceId, MARKETPLACE),
                    or(
                        like(productVariations.parentAsin, 'B0VAR%'),
                        like(productVariations.parentAsin, 'B0GHT%')
                    )
                )
            );
    });

    it('finishes a 300+ member family and overlaps-deletes without casting members as a row', async () => {
        const children = Array.from({ length: CHILD_COUNT }, (_, index) => ({
            asin: `B0VARCH${String(index + 1).padStart(5, '0')}`,
            attributes: { color: 'Black', size: 'L' },
        }));
        const sharedChild = children[0]!.asin;
        const claimId = randomUUID();
        const otherClaimId = randomUUID();

        expect(
            await claimVariationFetch({
                marketplaceId: MARKETPLACE,
                parentAsin: OTHER_PARENT,
                claimId: otherClaimId,
            })
        ).toBe(true);
        expect(
            await finishVariationFetch({
                marketplaceId: MARKETPLACE,
                parentAsin: OTHER_PARENT,
                claimId: otherClaimId,
                resolution: {
                    kind: 'family',
                    theme: ['color'],
                    children: [{ asin: sharedChild, attributes: { color: 'Red' } }],
                },
            })
        ).toBe(true);

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
                    children,
                },
            })
        ).toBe(true);

        const row = await getStoredVariation({ marketplaceId: MARKETPLACE, parentAsin: PARENT });
        expect(row?.state).toBe('ready');
        expect(row?.kind).toBe('family');
        expect(row?.children).toHaveLength(CHILD_COUNT);
        expect(row?.memberAsins).toHaveLength(CHILD_COUNT + 1);
        expect(row?.memberAsins[0]).toBe(PARENT);
        expect(row?.memberAsins).toContain(sharedChild);

        expect(
            await getStoredVariation({ marketplaceId: MARKETPLACE, parentAsin: OTHER_PARENT })
        ).toBeNull();

        const byMember = await lookupVariationsByMember(MARKETPLACE, sharedChild);
        expect(byMember).toHaveLength(1);
        expect(byMember[0]?.parentAsin).toBe(PARENT);
        expect(byMember[0]?.attemptedAt).toBeInstanceOf(Date);
        expect(byMember[0]?.fetchedAt).toBeInstanceOf(Date);
        expect(Array.isArray(byMember[0]?.children)).toBe(true);
        expect(Array.isArray(byMember[0]?.theme)).toBe(true);
    });
});
