import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { normalizeDiscoveryBrand } from '@/services/discovery-candidate-policy';
import { verifiedOfficialBrands } from '@/services/official-brand-manifest';
import { db } from './index';
import { officialBrands } from './official-brand-schema';

const manifestSchema = z.array(
    z.object({
        marketplaceId: z.string().min(1),
        displayBrand: z.string().trim().min(1).max(200),
        evidenceUrl: z.url().refine(value => value.startsWith('https://')),
        verifiedAt: z.iso.datetime(),
    })
);

export const syncOfficialBrandRegistry = async (manifest: unknown = verifiedOfficialBrands) => {
    const entries = manifestSchema.parse(manifest);
    if (!entries.length) return 0;
    const unique = new Map(
        entries.map(entry => [
            `${entry.marketplaceId}:${normalizeDiscoveryBrand(entry.displayBrand)}`,
            {
                ...entry,
                normalizedBrand: normalizeDiscoveryBrand(entry.displayBrand),
                verifiedAt: new Date(entry.verifiedAt),
            },
        ])
    );
    await db
        .insert(officialBrands)
        .values([...unique.values()])
        .onConflictDoUpdate({
            target: [officialBrands.marketplaceId, officialBrands.normalizedBrand],
            set: {
                displayBrand: sql`excluded.display_brand`,
                evidenceUrl: sql`excluded.evidence_url`,
                verifiedAt: sql`excluded.verified_at`,
            },
        });
    return unique.size;
};
