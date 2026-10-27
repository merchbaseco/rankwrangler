import { notifyKeywordDirectoryRows } from './keyword-directory-notifications';
import { writeKeywordEvents } from './keyword-events';
import { and, eq, inArray, sql, getTableColumns } from 'drizzle-orm';
import {
    normalizeDiscoveryBrand,
    normalizeDiscoveryText,
    normalizeDiscoveryKeyword,
} from '@/services/discovery-candidate-policy';
import type { DiscoveryScope, DiscoverySource } from '@/services/discovery-types';
import { catalogQueries } from './catalog-search-schema';
import { discoveryEvidence, discoveryTargets } from './discovery-target-schema';
import type { db } from './index';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DiscoveryCandidate = {
    scope: DiscoveryScope;
    evidence: { kind: DiscoverySource; sourceKey: string; observedAt: Date; productId?: string };
};

export const recordDiscoveryCandidates = async (
    tx: Transaction,
    candidates: readonly DiscoveryCandidate[]
) => {
    if (!candidates.length) return { targets: 0 };
    const terms = new Map(
        candidates.map(candidate => {
            const displayTerm =
                candidate.scope.kind === 'keyword'
                    ? normalizeDiscoveryKeyword(candidate.scope.term)
                    : normalizeDiscoveryText(candidate.scope.term);
            return [displayTerm.toLowerCase(), displayTerm];
        })
    );
    await tx
        .insert(catalogQueries)
        .values(
            [...terms]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([normalizedTerm, displayTerm]) => ({
                    source: 'keepa',
                    marketplaceId: 'ATVPDKIKX0DER',
                    normalizedTerm,
                    displayTerm,
                }))
        )
        .onConflictDoNothing();
    const queries = await tx
        .select({ id: catalogQueries.id, term: catalogQueries.normalizedTerm })
        .from(catalogQueries)
        .where(
            and(
                eq(catalogQueries.source, 'keepa'),
                eq(catalogQueries.marketplaceId, 'ATVPDKIKX0DER'),
                inArray(catalogQueries.normalizedTerm, [...terms.keys()])
            )
        );
    await tx
        .select({ id: catalogQueries.id })
        .from(catalogQueries)
        .where(
            inArray(
                catalogQueries.id,
                queries.map(query => query.id)
            )
        )
        .orderBy(catalogQueries.id)
        .for('update');
    const previousTargets = await tx
        .select({ id: discoveryTargets.id, tracking: discoveryTargets.tracking })
        .from(discoveryTargets)
        .where(
            inArray(
                discoveryTargets.queryId,
                queries.map(query => query.id)
            )
        );
    const queryIds = new Map(queries.map(query => [query.term, query.id]));
    const identities = new Map(
        candidates.map(candidate => {
            const queryId = queryIds.get(
                normalizeDiscoveryText(candidate.scope.term).toLowerCase()
            );
            if (!queryId) throw new Error('Discovery candidate has no canonical keyword');
            const scopeKey =
                candidate.scope.kind === 'brand'
                    ? normalizeDiscoveryBrand(candidate.scope.brandName)
                    : '';
            return [
                `${queryId}:${candidate.scope.kind}:${scopeKey}`,
                {
                    queryId,
                    kind: candidate.scope.kind,
                    scopeKey,
                    enabled: true,
                    tracking:
                        candidate.evidence.kind === 'interest'
                            ? ('tracked' as const)
                            : ('trial' as const),
                    brandName:
                        candidate.scope.kind === 'brand'
                            ? normalizeDiscoveryText(candidate.scope.brandName)
                            : null,
                },
            ];
        })
    );
    const targets = await tx
        .insert(discoveryTargets)
        .values([...identities].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value))
        .onConflictDoUpdate({
            target: [discoveryTargets.queryId, discoveryTargets.kind, discoveryTargets.scopeKey],
            set: {
                enabled: sql`case when excluded.tracking='tracked' then true else discovery_targets.enabled end`,
                tracking: sql`case when excluded.tracking='tracked' then 'tracked' else discovery_targets.tracking end`,
                nextCheckAt: sql`case when discovery_targets.tracking='dormant' and excluded.tracking='tracked' then timezone('UTC',now()) else discovery_targets.next_check_at end`,
            },
        })
        .returning({ ...getTableColumns(discoveryTargets), inserted: sql<boolean>`(xmax=0)` });
    const targetIds = new Map(
        targets.map(target => [`${target.queryId}:${target.kind}:${target.scopeKey}`, target.id])
    );
    const evidence = new Map(
        candidates.map(candidate => {
            const queryId = queryIds.get(
                normalizeDiscoveryText(candidate.scope.term).toLowerCase()
            );
            const scopeKey =
                candidate.scope.kind === 'brand'
                    ? normalizeDiscoveryBrand(candidate.scope.brandName)
                    : '';
            const targetId = targetIds.get(`${queryId}:${candidate.scope.kind}:${scopeKey}`);
            if (!targetId) throw new Error('Discovery candidate has no scoped target');
            return [
                `${targetId}:${candidate.evidence.kind}:${candidate.evidence.sourceKey}`,
                {
                    targetId,
                    ...candidate.evidence,
                    eligible: true,
                },
            ];
        })
    );
    await tx
        .insert(discoveryEvidence)
        .values([...evidence].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value))
        .onConflictDoUpdate({
            target: [
                discoveryEvidence.targetId,
                discoveryEvidence.kind,
                discoveryEvidence.sourceKey,
            ],
            set: { eligible: true, observedAt: sql`excluded.observed_at` },
        });
    await writeKeywordEvents(
        tx,
        targets
            .filter(target => target.inserted && target.kind === 'keyword')
            .map(target => {
                const term = [...queryIds].find(([, id]) => id === target.queryId)?.[0];
                if (!term) throw new Error('Missing keyword event identity');
                return {
                    id: target.queryId,
                    term,
                    action: 'keyword.added',
                    occurredAt: new Date(),
                    details: {
                        tracking: target.tracking,
                        sources: [
                            ...new Set(
                                candidates
                                    .filter(
                                        c =>
                                            normalizeDiscoveryText(c.scope.term).toLowerCase() ===
                                            term
                                    )
                                    .map(c => c.evidence.kind)
                            ),
                        ],
                    },
                };
            })
    );
    await writeKeywordEvents(
        tx,
        targets
            .filter(
                target =>
                    !target.inserted &&
                    target.kind === 'keyword' &&
                    previousTargets.some(
                        previous =>
                            previous.id === target.id && previous.tracking !== target.tracking
                    )
            )
            .map(target => ({
                id: target.queryId,
                term: [...queryIds].find(([, id]) => id === target.queryId)![0],
                action: 'keyword.tracking.changed',
                occurredAt: new Date(),
                details: {
                    previousTracking: previousTargets.find(previous => previous.id === target.id)!
                        .tracking,
                    tracking: target.tracking,
                },
            }))
    );
    await notifyKeywordDirectoryRows(tx, [...terms.keys()]);
    return { targets: targets.length };
};
