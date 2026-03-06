import postgres from 'postgres';
import { classifyMerchKeyword } from '../services/spapi/ba-keywords-aggregation';
import {
    createClient,
    incrementMap,
    parseArgs,
    printSummary,
    type ChangeRow,
    type CliOptions,
    type DryRunSummary,
    type KeywordRow,
    type SnapshotRow,
    type SnapshotSummary,
} from './reclassify-top-search-terms-lib';

const main = async () => {
    const options = parseArgs(process.argv.slice(2));
    const sql = createClient();

    try {
        const snapshots = await loadSnapshots(sql, options);
        if (snapshots.length === 0) {
            console.log('No top search term snapshots matched the requested filters.');
            return;
        }

        const summary: DryRunSummary = {
            totalSnapshots: snapshots.length,
            totalRowsScanned: 0,
            totalChangedRows: 0,
            totalFlipsToIrrelevant: 0,
            totalFlipsToRelevant: 0,
            totalReasonOnlyChanges: 0,
            wouldRemoveRows: 0,
            affectedSnapshots: 0,
            removedByReason: new Map<string, number>(),
            changedSamples: [] as ChangeRow[],
            snapshotSummaries: [] as SnapshotSummary[],
        };

        for (const snapshot of snapshots) {
            const rows = await loadSnapshotKeywords(sql, snapshot.id);
            const changes: ChangeRow[] = [];
            let nextRelevantCount = 0;

            for (const row of rows) {
                summary.totalRowsScanned += 1;

                const classification = classifyMerchKeyword(row.search_term);
                if (classification.isMerchRelevant) {
                    nextRelevantCount += 1;
                }

                if (
                    row.is_merch_relevant === classification.isMerchRelevant &&
                    row.merch_reason === classification.merchReason
                ) {
                    continue;
                }

                const change = {
                    rowId: row.id,
                    snapshotId: snapshot.id,
                    reportPeriod: snapshot.report_period,
                    marketplaceId: snapshot.marketplace_id,
                    dataEndDate: snapshot.data_end_date,
                    observedDate: snapshot.observed_date,
                    searchTerm: row.search_term,
                    previousRelevant: row.is_merch_relevant,
                    nextRelevant: classification.isMerchRelevant,
                    previousReason: row.merch_reason,
                    nextReason: classification.merchReason,
                } satisfies ChangeRow;

                changes.push(change);
                summary.totalChangedRows += 1;

                if (row.is_merch_relevant && !classification.isMerchRelevant) {
                    summary.totalFlipsToIrrelevant += 1;
                    summary.wouldRemoveRows += 1;
                    incrementMap(summary.removedByReason, classification.merchReason);
                } else if (!row.is_merch_relevant && classification.isMerchRelevant) {
                    summary.totalFlipsToRelevant += 1;
                } else {
                    summary.totalReasonOnlyChanges += 1;
                }

                if (summary.changedSamples.length < options.sampleSize) {
                    summary.changedSamples.push(change);
                }
            }

            if (changes.length > 0) {
                summary.affectedSnapshots += 1;
                summary.snapshotSummaries.push({
                    snapshotId: snapshot.id,
                    reportPeriod: snapshot.report_period,
                    marketplaceId: snapshot.marketplace_id,
                    dataEndDate: snapshot.data_end_date,
                    observedDate: snapshot.observed_date,
                    previousKeywordCount: snapshot.keyword_count,
                    nextKeywordCount: nextRelevantCount,
                    changedRows: changes.length,
                });
            }

            if (options.shouldWrite && changes.length > 0) {
                await applyChanges(sql, snapshot.id, changes, nextRelevantCount);
            }
        }

        printSummary(summary, options);
    } finally {
        await sql.end();
    }
};

const loadSnapshots = async (
    sql: postgres.Sql,
    options: CliOptions
): Promise<SnapshotRow[]> => {
    const clauses: string[] = [];
    const values: unknown[] = [];

    if (options.reportPeriod !== 'ALL') {
        values.push(options.reportPeriod);
        clauses.push(`report_period = $${values.length}`);
    }

    if (options.marketplaceId) {
        values.push(options.marketplaceId);
        clauses.push(`marketplace_id = $${values.length}`);
    }

    let query = `
        SELECT
            id,
            marketplace_id,
            report_period,
            data_end_date,
            observed_date,
            keyword_count
        FROM top_search_terms_snapshots
    `;

    if (clauses.length > 0) {
        query += ` WHERE ${clauses.join(' AND ')}`;
    }

    query += ' ORDER BY report_period ASC, data_end_date DESC, observed_date DESC';

    if (options.snapshotLimit !== null) {
        values.push(options.snapshotLimit);
        query += ` LIMIT $${values.length}`;
    }

    return sql.unsafe<SnapshotRow[]>(query, values);
};

const loadSnapshotKeywords = async (
    sql: postgres.Sql,
    snapshotId: string
): Promise<KeywordRow[]> => {
    return sql<KeywordRow[]>`
        SELECT
            id,
            search_term,
            is_merch_relevant,
            merch_reason
        FROM top_search_terms_keyword_daily
        WHERE snapshot_id = ${snapshotId}
        ORDER BY search_frequency_rank ASC, search_term ASC
    `;
};

const applyChanges = async (
    sql: postgres.Sql,
    snapshotId: string,
    changes: ChangeRow[],
    nextRelevantCount: number
) => {
    await sql.begin(async (tx) => {
        const rowIds = changes.map((change) => change.rowId);
        const relevances = changes.map((change) => change.nextRelevant);
        const reasons = changes.map((change) => change.nextReason);

        await tx`
            UPDATE top_search_terms_keyword_daily AS keyword
            SET
                is_merch_relevant = updates.is_merch_relevant,
                merch_reason = updates.merch_reason
            FROM (
                SELECT *
                FROM unnest(
                    ${rowIds}::uuid[],
                    ${relevances}::boolean[],
                    ${reasons}::text[]
                ) AS updates(id, is_merch_relevant, merch_reason)
            ) AS updates
            WHERE keyword.id = updates.id
        `;

        await tx`
            UPDATE top_search_terms_snapshots
            SET
                keyword_count = ${nextRelevantCount},
                updated_at = now()
            WHERE id = ${snapshotId}
        `;
    });
};

await main();
