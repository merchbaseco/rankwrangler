import { beforeEach, describe, it, expect } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { keywordAutocomplete } from '@/db/keyword-autocomplete-schema';
import { discoveryTargets, discoveryEvidence } from '@/db/discovery-target-schema';
import {
    claimKeywordAutocomplete,
    finishKeywordAutocomplete,
    releaseKeywordAutocomplete,
} from '@/db/keyword-autocomplete-work';
import { expandKeywordAutocomplete } from '@/services/keyword-autocomplete';
import {
    AutocompleteDeferred,
    deferAutocomplete,
    reserveAutocompleteCall,
} from '@/db/keyword-autocomplete-capacity';
import {
    resetDiscoveryFixture,
    seedDiscoveryTarget,
    discoveryNow as now,
} from './discovery-fixture';

const seed = () => seedDiscoveryTarget({ kind: 'keyword', term: 'hawaiian christmas' });
const claim = async (at = now) => {
    const work = await claimKeywordAutocomplete(at);
    if (!work) throw new Error('Missing autocomplete work');
    return work;
};

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('durable keyword autocomplete', () => {
    beforeEach(resetDiscoveryFixture);
    it('expands once, rejects self/duplicates and registers trials without recursively expanding them', async () => {
        await seed();
        const work = await claim();
        await finishKeywordAutocomplete(
            work,
            [
                'hawaiian christmas',
                ' Hawaiian Christmas Shirt ',
                'hawaiian christmas shirt',
                'hawaiian christmas cards',
            ],
            now
        );
        expect(await claimKeywordAutocomplete(now)).toBeNull();
        expect(
            (await db.select().from(discoveryTargets)).filter(t => t.tracking === 'trial')
        ).toHaveLength(2);
        expect(
            (await db.select().from(discoveryEvidence)).filter(
                e => e.kind === 'autocomplete' && e.sourceKey === work.queryId && e.eligible
            )
        ).toHaveLength(2);
        const [expansion] = await db.select().from(keywordAutocomplete);
        expect(expansion).toMatchObject({ stage: 'complete' });
        expect(expansion.suggestions).toEqual([
            'hawaiian christmas shirt',
            'hawaiian christmas cards',
        ]);
    });
    it('releases a deferred seed without completing it', async () => {
        await seed();
        const retryAt = new Date(now.getTime() + 60_000);
        const result = await expandKeywordAutocomplete(undefined, {
            claim: () => claimKeywordAutocomplete(now),
            suggest: async () => {
                throw new AutocompleteDeferred(retryAt);
            },
            finish: finishKeywordAutocomplete,
            release: releaseKeywordAutocomplete,
        });
        expect(result).toMatchObject({ kind: 'deferred', nextWakeAt: retryAt });
        const [expansion] = await db.select().from(keywordAutocomplete);
        expect(expansion).toMatchObject({ stage: 'pending', claimToken: null });
        expect(expansion.nextDueAt).toEqual(retryAt);
    });
    it('fences stale owners', async () => {
        await seed();
        const old = await claim();
        expect(await claimKeywordAutocomplete(now)).toBeNull();
        const later = new Date(now.getTime() + 300_001);
        const work = await claim(later);
        await expect(
            finishKeywordAutocomplete(old, ['hawaiian christmas shirt'], later)
        ).rejects.toThrow('expired');
        await finishKeywordAutocomplete(work, ['hawaiian christmas shirt'], later);
        expect(await claimKeywordAutocomplete(later)).toBeNull();
    });
    it('completes empty responses and ignores disabled seeds', async () => {
        const target = await seed();
        await db
            .update(discoveryTargets)
            .set({ enabled: false })
            .where(eq(discoveryTargets.id, target.id));
        expect(await claimKeywordAutocomplete(now)).toBeNull();
        await db
            .update(discoveryTargets)
            .set({ enabled: true })
            .where(eq(discoveryTargets.id, target.id));
        const work = await claim();
        await finishKeywordAutocomplete(work, [], now);
        expect(await claimKeywordAutocomplete(now)).toBeNull();
    });
    it('persists autocomplete pacing and never shortens cooldowns', async () => {
        await reserveAutocompleteCall(now);
        await expect(reserveAutocompleteCall(now)).rejects.toThrow('deferred');
        await deferAutocomplete(new Date(now.getTime() + 60_000));
        await deferAutocomplete(new Date(now.getTime() + 20_000));
        await expect(reserveAutocompleteCall(new Date(now.getTime() + 30_000))).rejects.toThrow(
            'deferred'
        );
    });
});
