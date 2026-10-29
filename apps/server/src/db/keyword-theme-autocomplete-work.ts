import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { keywordRetryAt } from '@/services/keyword-collection-policy';
import { isAutomaticSyncPaused } from './automatic-sync';
import { recordDiscoveryCandidates } from './discovery-candidates';
import { db } from './index';
import { keywordThemes as themes } from './keyword-theme-schema';

const leaseMs = 300_000;

// Claims a theme whose one-time autocomplete expansion is due. With a themeId, only that theme.
// Shares the keyword autocomplete lock, pacing and daily ceiling, and waits while sync is paused.
export const claimThemeAutocomplete = async (now = new Date(), themeId?: string) =>
    db.transaction(async tx => {
        if (await isAutomaticSyncPaused(tx)) return null;
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('keyword-autocomplete'))`);
        const [due] = await tx
            .select()
            .from(themes)
            .where(
                and(
                    eq(themes.marketplaceId, 'ATVPDKIKX0DER'),
                    themeId ? eq(themes.id, themeId) : undefined,
                    sql`${themes.stage}<>'complete' and ${themes.nextDueAt}<=${now.toISOString()}::timestamp
                and (${themes.claimAt} is null or ${themes.claimAt}<${new Date(now.getTime() - leaseMs).toISOString()}::timestamp)`
                )
            )
            .orderBy(themes.nextDueAt, themes.createdAt, themes.id)
            .limit(1)
            .for('update', { skipLocked: true });
        if (!due) return null;
        const [owned] = await tx
            .update(themes)
            .set({ claimToken: randomUUID(), claimAt: now })
            .where(eq(themes.id, due.id))
            .returning();
        return { ...owned, claimToken: owned.claimToken! };
    });
export type ThemeAutocompleteWork = NonNullable<Awaited<ReturnType<typeof claimThemeAutocomplete>>>;

// Saves the theme's suggestions, registers the kept ones as keyword trials with
// `themeAutocomplete` evidence naming the theme, and completes the theme in one transaction.
export const finishThemeAutocomplete = async (
    work: ThemeAutocompleteWork,
    suggestions: readonly string[],
    trials: readonly string[],
    now = new Date()
) =>
    db.transaction(async tx => {
        const [owned] = await tx
            .select({ id: themes.id })
            .from(themes)
            .where(ownedBy(work))
            .for('update');
        if (!owned) throw new Error('Theme autocomplete claim expired');
        await recordDiscoveryCandidates(
            tx,
            trials.map(term => ({
                scope: { kind: 'keyword' as const, term },
                evidence: {
                    kind: 'themeAutocomplete' as const,
                    sourceKey: work.theme,
                    observedAt: now,
                },
            }))
        );
        await tx
            .update(themes)
            .set({
                stage: 'complete',
                suggestions: [...suggestions],
                trialCount: trials.length,
                completedAt: now,
                claimToken: null,
                claimAt: null,
                failureCount: 0,
            })
            .where(eq(themes.id, work.id));
    });

export const releaseThemeAutocomplete = async (
    work: ThemeAutocompleteWork,
    input: { retryAt?: Date; failed?: boolean; now?: Date } = {}
) => {
    const now = input.now ?? new Date();
    await db
        .update(themes)
        .set({
            claimToken: null,
            claimAt: null,
            nextDueAt:
                input.retryAt ?? (input.failed ? keywordRetryAt(work.failureCount, now) : now),
            failureCount: work.failureCount + (input.failed ? 1 : 0),
        })
        .where(ownedBy(work));
};

const ownedBy = (work: ThemeAutocompleteWork) =>
    and(eq(themes.id, work.id), eq(themes.claimToken, work.claimToken));
