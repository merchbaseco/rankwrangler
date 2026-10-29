import { eq } from 'drizzle-orm';
import {
    catalogCapacityBalance,
    catalogCapacityDecision,
} from '@/services/catalog-capacity-policy';
import { isAutomaticSyncPaused } from './automatic-sync';
import { db } from './index';
import { autocompleteReadyAt } from './keyword-autocomplete-capacity';
import { keywordProviderCapacity } from './keyword-autocomplete-schema';
import { spApiCatalogCapacity } from './spapi-capacity-schema';

// A gate reports when its provider can next start background keyword work, or null while the
// keyword pipeline is paused. Gated queues fetch a job only once this time has passed; the job's
// own reservation stays authoritative, so a lost race defers instead of overrunning the provider.
export type ProviderGate = (now?: Date) => Promise<Date | null>;

// For free, quota-light work that should run regardless of Pause sync (the Brand Analytics import
// and keyword listing). It uses the gated worker only for its self-scheduled followups.
export const alwaysOpenGate: ProviderGate = async (now = new Date()) => now;

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

// One background Catalog start interval, with 10% slack, for staggering parallel scan workers.
export const spApiBackgroundSpacingMs = async (now = new Date()) => {
    const [capacity] = await db
        .select()
        .from(spApiCatalogCapacity)
        .where(eq(spApiCatalogCapacity.id, 1));
    const rps = capacity ? catalogCapacityBalance(capacity, now).backgroundRps : 0.5;
    return Math.ceil((1000 / rps) * 1.1);
};

export const autocompleteGate: ProviderGate = async (now = new Date()) => {
    if (await isAutomaticSyncPaused()) return null;
    const [row] = await db
        .select()
        .from(keywordProviderCapacity)
        .where(eq(keywordProviderCapacity.provider, 'autocomplete'));
    return autocompleteReadyAt(row, now);
};
