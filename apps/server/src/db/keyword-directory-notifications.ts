import { sql } from 'drizzle-orm';
import type { db } from './index';
import { syncKeywordTargets } from './keyword-target-sync';

type Transaction = Pick<Parameters<Parameters<typeof db.transaction>[0]>[0], 'execute'>;
export const notifyKeywordDirectoryRows = async (tx: Transaction, terms: readonly string[]) => {
    const unique = [...new Set(terms)];
    if (!unique.length) return;
    const batches: string[] = [];
    for (let i = 0; i < unique.length; i += 5)
        batches.push(JSON.stringify({ terms: unique.slice(i, i + 5) }));
    await tx.execute(sql`select pg_notify('keyword_directory_changed', value)
        from jsonb_array_elements_text(${JSON.stringify(batches)}::jsonb)`);
};
export const notifyKeywordQueryRows = async (tx: Transaction, queryIds: readonly string[]) => {
    if (!queryIds.length) return;
    const rows = await tx.execute<{
        term: string;
    }>(sql`select normalized_term term from catalog_queries
        where id in (${sql.join(
            queryIds.map(id => sql`${id}::uuid`),
            sql`,`
        )})`);
    await notifyKeywordDirectoryRows(
        tx,
        rows.map(row => row.term)
    );
};

/**
 * Some Products became or stopped being active Merch listings: recount the measures of every
 * keyword that retains them (Merch count and shelf, see `syncKeywordTargets`) and push those rows.
 */
export const refreshKeywordProductRows = async (tx: Transaction, productIds: readonly string[]) => {
    if (!productIds.length) return;
    const rows = await tx.execute<{ term: string; target_id: string | null }>(sql`
        select distinct q.normalized_term term,t.id target_id
        from keyword_products kp join catalog_queries q on q.id=kp.query_id
        left join discovery_targets t on t.query_id=q.id and t.kind='keyword'
        where kp.product_id in (${sql.join(
            productIds.map(id => sql`${id}::uuid`),
            sql`,`
        )})`);
    await syncKeywordTargets(
        tx,
        rows.flatMap(row => (row.target_id ? [row.target_id] : [])),
        'all'
    );
    await notifyKeywordDirectoryRows(
        tx,
        rows.map(row => row.term)
    );
};
