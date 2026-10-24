import { refreshKeywordDemand } from '@/db/keyword-demand';
import {
    admitKeywordCandidates,
    listScheduledKeywordHeads,
    resolveScheduledKeywordHead,
    retireKeywordAdmissions,
} from '@/db/keyword-scheduling';
import { type CatalogSearchOperation, dispatchCatalogSearchOperation } from './catalog-search';

type DueResolution = Awaited<ReturnType<typeof resolveScheduledKeywordHead>>;
export interface CatalogQueryCollectionDeps {
    admitCandidates?: typeof admitKeywordCandidates;
    refreshDemand?: typeof refreshKeywordDemand;
    retireAdmissions?: typeof retireKeywordAdmissions;
    listDueQueries: (input: { dueAtOrBefore: Date; now: Date }) => Promise<Array<{ id: string }>>;
    resolveDueRequest: (input: { queryId: string; now?: Date }) => Promise<DueResolution>;
    dispatchOperation: (operation: CatalogSearchOperation) => Promise<boolean>;
}
const defaultCollectionDeps: CatalogQueryCollectionDeps = {
    refreshDemand: refreshKeywordDemand,
    admitCandidates: admitKeywordCandidates,
    retireAdmissions: retireKeywordAdmissions,
    listDueQueries: async ({ now }) => await listScheduledKeywordHeads(now),
    resolveDueRequest: resolveScheduledKeywordHead,
    dispatchOperation: dispatchCatalogSearchOperation,
};

export const collectDueCatalogQueries = async (
    now = new Date(),
    deps: CatalogQueryCollectionDeps = defaultCollectionDeps
) => {
    await deps.refreshDemand?.(now);
    await deps.retireAdmissions?.(now);
    await deps.admitCandidates?.(now);
    const queries = await deps.listDueQueries({ dueAtOrBefore: now, now });
    let startedCount = 0;
    let joinedCount = 0;
    for (const query of queries) {
        const resolution = await deps.resolveDueRequest({ queryId: query.id, now });
        if (resolution.kind === 'notDue') continue;
        if (resolution.operation.type !== 'catalogSearch')
            throw new Error('Expected keyword operation.');
        const dispatched = await deps.dispatchOperation(resolution.operation);
        if (!dispatched) continue;
        if (resolution.created) startedCount += 1;
        else joinedCount += 1;
    }
    return { didWork: startedCount > 0, dueCount: queries.length, startedCount, joinedCount };
};
