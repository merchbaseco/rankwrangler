import { isAutomaticSyncPaused } from '@/db/automatic-sync';
import { exploreKeywords } from './keyword-discovery';
import { expandKeywordAutocomplete } from './keyword-autocomplete';
import { mineProductKeywords } from './product-keyword-mining';

type StepResult = { didWork: boolean; nextWakeAt: Date | null; kind: string; error?: unknown };
type KeywordSyncDeps = {
    isPaused: () => Promise<boolean>;
    steps: readonly (() => Promise<StepResult>)[];
};
const defaults: KeywordSyncDeps = {
    isPaused: isAutomaticSyncPaused,
    steps: [exploreKeywords, expandKeywordAutocomplete, mineProductKeywords],
};
export const processKeywordSync = async (deps: KeywordSyncDeps = defaults) => {
    let didWork = false;
    const wakes: Date[] = [];
    const errors: unknown[] = [];
    for (const step of deps.steps) {
        if (await deps.isPaused()) return { didWork, paused: true, nextWakeAt: null };
        try {
            const result = await step();
            didWork ||= result.didWork;
            if (result.kind === 'failed')
                errors.push(result.error ?? new Error('Keyword sync step failed'));
            if (result.nextWakeAt) wakes.push(result.nextWakeAt);
        } catch (error) {
            errors.push(error);
        }
    }
    if (await deps.isPaused()) return { didWork, paused: true, nextWakeAt: null };
    if (errors.length) throw errors[0];
    const earliest = wakes.length ? Math.min(...wakes.map(date => date.getTime())) : Infinity;
    const next = didWork ? Date.now() + 10_000 : earliest;
    return {
        didWork,
        paused: false,
        nextWakeAt: Number.isFinite(next) ? new Date(Math.max(Date.now() + 10_000, next)) : null,
    };
};
