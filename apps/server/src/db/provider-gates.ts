import { eq } from 'drizzle-orm';
import { catalogCapacityDecision } from '@/services/catalog-capacity-policy';
import { isAutomaticSyncPaused } from './automatic-sync';
import { db } from './index';
import { keywordMiningCapacity } from './keyword-mining-schema';
import { spApiCatalogCapacity } from './spapi-capacity-schema';

// A gate reports when its provider can next start background keyword work, or null while the
// keyword pipeline is paused. Gated queues fetch a job only once this time has passed; the job's
// own reservation stays authoritative, so a lost race defers instead of overrunning the provider.
export type ProviderGate = (now?: Date) => Promise<Date | null>;

export const spApiBackgroundGate: ProviderGate = async (now = new Date()) => {
    if (await isAutomaticSyncPaused()) return null;
    const [capacity] = await db
        .select()
        .from(spApiCatalogCapacity)
        .where(eq(spApiCatalogCapacity.id, 1));
    if (!capacity) return now;
    const decision = catalogCapacityDecision(capacity, {
        priority: 'background',
        protectedQueued: false,
        now,
    });
    return decision.kind === 'deferred' ? decision.retryAt : now;
};

const keywordProviderGate =
    (provider: 'ads' | 'jev' | 'autocomplete'): ProviderGate =>
    async (now = new Date()) => {
        if (await isAutomaticSyncPaused()) return null;
        const [row] = await db
            .select({ nextStartAt: keywordMiningCapacity.nextStartAt })
            .from(keywordMiningCapacity)
            .where(eq(keywordMiningCapacity.provider, provider));
        return row && row.nextStartAt > now ? row.nextStartAt : now;
    };

export const adsGate = keywordProviderGate('ads');
export const jevGate = keywordProviderGate('jev');
export const autocompleteGate = keywordProviderGate('autocomplete');
