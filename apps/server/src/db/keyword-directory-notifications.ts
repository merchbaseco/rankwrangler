import { sql } from 'drizzle-orm';
import type { db } from './index';

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

export const notifyKeywordProductRows = async (tx: Transaction, productIds: readonly string[]) => {
    if (!productIds.length) return;
    const rows = await tx.execute<{ term: string }>(sql`select distinct q.normalized_term term
        from keyword_products kp join catalog_queries q on q.id=kp.query_id
        where kp.product_id in (${sql.join(
            productIds.map(id => sql`${id}::uuid`),
            sql`,`
        )})`);
    await notifyKeywordDirectoryRows(
        tx,
        rows.map(row => row.term)
    );
};
