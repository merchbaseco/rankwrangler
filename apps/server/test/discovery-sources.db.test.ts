import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { discoveryTargets, discoveryEvidence } from '@/db/discovery-target-schema';
import { db } from '@/db/index';
import { catalogQueries, products, officialBrands } from '@/db/schema';
import { syncOfficialBrandRegistry } from '@/db/official-brand-registry';
import { recordProductSearchInterest } from '@/db/product-search-interest';
import { recordDiscoveryCandidates } from '@/db/discovery-candidates';
import { productSearchInput } from '@/api/product-search-input';
import { discoveryNow as now, resetDiscoveryFixture } from './discovery-fixture';
describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('keyword sources without tags', () => {
    beforeEach(resetDiscoveryFixture);
    it('tracks actual user searches immediately, once, as tracked keywords', async () => {
        await recordProductSearchInterest(productSearchInput.parse({ term: 'RN' }));
        await recordProductSearchInterest(productSearchInput.parse({ term: ' rn ' }));
        await recordProductSearchInterest(productSearchInput.parse({ term: 'B0TST00001' }));
        expect((await db.select().from(catalogQueries)).map(row => row.normalizedTerm)).toEqual([
            'rn',
        ]);
        expect((await db.select().from(discoveryTargets))[0]).toMatchObject({
            tracking: 'tracked',
            enabled: true,
        });
    });
    it('imports verified exact official brands idempotently', async () => {
        expect(await syncOfficialBrandRegistry()).toBe(4);
        expect(await syncOfficialBrandRegistry()).toBe(4);
        expect(await db.select().from(officialBrands)).toHaveLength(4);
        await expect(
            syncOfficialBrandRegistry([
                { marketplaceId: 'ATVPDKIKX0DER', displayBrand: 'Unverified' },
            ])
        ).rejects.toThrow();
    });
    it('merges concurrent overlapping source inputs once', async () => {
        const rows = ['fishing', 'fishing shirt'].map(term => ({
            scope: { kind: 'keyword' as const, term },
            evidence: { kind: 'interest' as const, sourceKey: 'request', observedAt: now },
        }));
        await db.transaction(tx => recordDiscoveryCandidates(tx, rows));
        for (let i = 0; i < 10; i += 1)
            await Promise.all([
                db.transaction(tx => recordDiscoveryCandidates(tx, rows)),
                db.transaction(tx => recordDiscoveryCandidates(tx, [...rows].reverse())),
            ]);
        expect(await db.select().from(discoveryTargets)).toHaveLength(2);
        expect(await db.select().from(discoveryEvidence)).toHaveLength(2);
    });
});
