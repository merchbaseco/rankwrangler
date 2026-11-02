import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import {
    productVariations,
    type StoredVariationChild,
} from '@/db/product-variation-schema';

export const VARIATIONS_GENERATOR_VERSION = 'catalog-relationships-2022-04-01:v1';
export const VARIATIONS_REUSE_MS = 24 * 60 * 60 * 1000;
export const VARIATIONS_ERROR_RETRY_MS = 5 * 60 * 1000;
const CLAIM_LEASE_SECONDS = 120;

export interface VariationFamilyIdentity {
    marketplaceId: string;
    parentAsin: string;
}

export type StoredVariationRow = {
    marketplaceId: string;
    parentAsin: string;
    generatorVersion: string;
    state: 'pending' | 'ready' | 'error';
    kind: 'family' | 'none' | null;
    theme: readonly string[] | null;
    children: readonly StoredVariationChild[] | null;
    memberAsins: string[];
    claimId: string;
    attemptedAt: Date;
    fetchedAt: Date | null;
};

export const lookupVariationsByMember = async (
    marketplaceId: string,
    asin: string
): Promise<readonly StoredVariationRow[]> => {
    const rows = await db.execute<StoredVariationRow>(sql`
        SELECT marketplace_id AS "marketplaceId",
            parent_asin AS "parentAsin",
            generator_version AS "generatorVersion",
            state,
            kind,
            theme,
            children,
            member_asins AS "memberAsins",
            claim_id AS "claimId",
            attempted_at AS "attemptedAt",
            fetched_at AS "fetchedAt"
        FROM product_variations
        WHERE marketplace_id = ${marketplaceId}
            AND ${asin.toUpperCase()} = ANY (member_asins)
    `);
    return rows;
};

export const getStoredVariation = async (
    identity: VariationFamilyIdentity
): Promise<StoredVariationRow | null> => {
    const [row] = await db
        .select()
        .from(productVariations)
        .where(
            and(
                eq(productVariations.marketplaceId, identity.marketplaceId),
                eq(productVariations.parentAsin, identity.parentAsin)
            )
        );
    return row ?? null;
};

/** Returns true only when this claimId won the parent row. */
export const claimVariationFetch = async ({
    marketplaceId,
    parentAsin,
    claimId,
}: VariationFamilyIdentity & { claimId: string }): Promise<boolean> => {
    const upperParent = parentAsin.toUpperCase();
    const rows = await db.execute<{ claim_id: string }>(sql`
        INSERT INTO product_variations (
            marketplace_id, parent_asin, generator_version, state, kind, theme, children,
            member_asins, claim_id, attempted_at, fetched_at
        ) VALUES (
            ${marketplaceId}, ${upperParent}, ${VARIATIONS_GENERATOR_VERSION}, 'pending', NULL, NULL, NULL,
            ARRAY[${upperParent}]::text[], ${claimId}::uuid, now(), NULL
        )
        ON CONFLICT (marketplace_id, parent_asin) DO UPDATE SET
            generator_version = excluded.generator_version,
            state = 'pending',
            kind = NULL,
            theme = NULL,
            children = NULL,
            member_asins = excluded.member_asins,
            claim_id = excluded.claim_id,
            attempted_at = excluded.attempted_at,
            fetched_at = NULL
        WHERE product_variations.generator_version <> excluded.generator_version
            OR (product_variations.state = 'pending'
                AND product_variations.attempted_at < now() - ${CLAIM_LEASE_SECONDS} * interval '1 second')
            OR (product_variations.state = 'error'
                AND product_variations.attempted_at < now() - ${VARIATIONS_ERROR_RETRY_MS} * interval '1 millisecond')
            OR (product_variations.state = 'ready'
                AND (
                    product_variations.fetched_at IS NULL
                    OR product_variations.fetched_at < now() - ${VARIATIONS_REUSE_MS} * interval '1 millisecond'
                ))
        RETURNING claim_id
    `);
    return rows.length > 0;
};

/** Keep a live multi-batch fetch from being stolen between Catalog calls. */
export const refreshVariationLease = async ({
    marketplaceId,
    parentAsin,
    claimId,
}: VariationFamilyIdentity & { claimId: string }): Promise<boolean> => {
    const rows = await db
        .update(productVariations)
        .set({ attemptedAt: new Date() })
        .where(
            and(
                eq(productVariations.marketplaceId, marketplaceId),
                eq(productVariations.parentAsin, parentAsin.toUpperCase()),
                eq(productVariations.claimId, claimId),
                eq(productVariations.state, 'pending')
            )
        )
        .returning({ claimId: productVariations.claimId });
    return rows.length > 0;
};

export const finishVariationFetch = async ({
    marketplaceId,
    parentAsin,
    claimId,
    resolution,
}: VariationFamilyIdentity & {
    claimId: string;
    resolution:
        | { kind: 'none' }
        | {
              kind: 'family';
              theme: readonly string[];
              children: readonly StoredVariationChild[];
          };
}): Promise<boolean> => {
    const upperParent = parentAsin.toUpperCase();
    const members =
        resolution.kind === 'none'
            ? [upperParent]
            : memberAsinsForFamily(upperParent, resolution.children);
    const theme = resolution.kind === 'family' ? [...resolution.theme] : [];
    const children = resolution.kind === 'family' ? [...resolution.children] : [];

    return await db.transaction(async tx => {
        const rows = await tx
            .update(productVariations)
            .set({
                state: 'ready',
                kind: resolution.kind,
                theme,
                children,
                memberAsins: members,
                fetchedAt: new Date(),
            })
            .where(
                and(
                    eq(productVariations.marketplaceId, marketplaceId),
                    eq(productVariations.parentAsin, upperParent),
                    eq(productVariations.claimId, claimId),
                    eq(productVariations.state, 'pending')
                )
            )
            .returning({ claimId: productVariations.claimId });
        if (rows.length === 0) {
            return false;
        }
        if (members.length > 1) {
            await tx.execute(sql`
                DELETE FROM product_variations
                WHERE marketplace_id = ${marketplaceId}
                    AND parent_asin <> ${upperParent}
                    AND member_asins && ${members}::text[]
            `);
        }
        return true;
    });
};

export const failVariationFetch = async ({
    marketplaceId,
    parentAsin,
    claimId,
}: VariationFamilyIdentity & { claimId: string }): Promise<void> => {
    await db
        .update(productVariations)
        .set({ state: 'error', fetchedAt: null })
        .where(
            and(
                eq(productVariations.marketplaceId, marketplaceId),
                eq(productVariations.parentAsin, parentAsin.toUpperCase()),
                eq(productVariations.claimId, claimId),
                eq(productVariations.state, 'pending')
            )
        );
};

const memberAsinsForFamily = (
    parentAsin: string,
    children: readonly { asin: string }[]
): string[] => {
    const seen = new Set<string>();
    const members: string[] = [];
    for (const asin of [parentAsin, ...children.map(child => child.asin)]) {
        const upper = asin.toUpperCase();
        if (!upper || seen.has(upper)) {
            continue;
        }
        seen.add(upper);
        members.push(upper);
    }
    return members;
};
