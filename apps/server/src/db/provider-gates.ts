import { eq } from 'drizzle-orm';
import { isAutomaticSyncPaused } from './automatic-sync';
import { db } from './index';
import { autocompleteReadyAt } from './keyword-autocomplete-capacity';
import { keywordProviderCapacity } from './keyword-autocomplete-schema';

// A gate reports when its queue can next start background keyword work, or null while the keyword
// pipeline is paused. Gated queues fetch a job only once this time has passed; the provider's own
// pacing (the Catalog limiter, autocomplete's reservation) stays authoritative.
export type ProviderGate = (now?: Date) => Promise<Date | null>;

// For free, quota-light work that should run regardless of Pause sync (the Brand Analytics import
// and keyword listing). It uses the gated worker only for its self-scheduled followups.
export const alwaysOpenGate: ProviderGate = async (now = new Date()) => now;

// Keyword scans: open while automatic sync runs. Rate is the Catalog limiter's job, so scan jobs
// stay queued only while paused.
export const syncRunningGate: ProviderGate = async (now = new Date()) =>
    (await isAutomaticSyncPaused()) ? null : now;

export const autocompleteGate: ProviderGate = async (now = new Date()) => {
    if (await isAutomaticSyncPaused()) return null;
    const [row] = await db
        .select()
        .from(keywordProviderCapacity)
        .where(eq(keywordProviderCapacity.provider, 'autocomplete'));
    return autocompleteReadyAt(row, now);
};
