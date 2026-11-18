import { sql } from 'drizzle-orm';
import type { db } from './index';
import { type KeywordMeasures, syncKeywordTargets } from './keyword-target-sync';

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
 * Some queries' keyword inputs changed outside a target write (a Catalog search added retained
 * Products, an autocomplete expansion finished): re-sync their keyword targets with `measures` and
 * push those rows.
 */
export const refreshKeywordQueryRows = async (
    tx: Transaction,
    queryIds: readonly string[],
    measures?: KeywordMeasures
) => {
    if (!queryIds.length) return;
    const targets = await tx.execute<{ id: string }>(sql`select id from discovery_targets
        where kind='keyword' and query_id in (${sql.join(
            queryIds.map(id => sql`${id}::uuid`),
            sql`,`
        )})`);
    await syncKeywordTargets(
        tx,
        targets.map(target => target.id),
        measures
    );
    await notifyKeywordQueryRows(tx, queryIds);
};

/**
 * Some Products became or stopped being active Merch listings: recount the measures of every
 * keyword that retains them (Merch count and shelf, see `syncKeywordTargets`) and push those rows.
 * A keyword's head Products are among its retained Products, so this covers every shelf they sit
 * on. It is one statement however many keywords retain the Products; it does not page them.
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

/**
 * A Product merge's keyword side (see `mergeProducts`): moves the other Product's keyword
 * memberships the survivor lacks, points every shelf at the survivor (first position wins), then
 * recounts every keyword that now retains the survivor. Call it after the survivor's own row is
 * final, so its Merch and listing status are what the recount reads.
 */
export const mergeKeywordProductRows = async (
    tx: Transaction,
    { survivorId, otherId }: { survivorId: string; otherId: string }
) => {
    const survivor = sql`${survivorId}::uuid`;
    const other = sql`${otherId}::uuid`;
    await tx.execute(sql`
        update keyword_products set product_id=${survivor}
        where product_id=${other}
            and query_id not in (select query_id from keyword_products where product_id=${survivor})`);
    await tx.execute(sql`delete from keyword_products where product_id=${other}`);
    await tx.execute(sql`
        update discovery_targets t set head_product_ids=(
            select coalesce(jsonb_agg(v order by o), '[]'::jsonb) from (
                select v, min(o) o from (
                    select case when e=${otherId} then ${survivorId} else e end v, o
                    from jsonb_array_elements_text(t.head_product_ids) with ordinality x(e, o)
                ) replaced group by v
            ) deduped
        )
        where t.head_product_ids ? ${otherId}`);
    await refreshKeywordProductRows(tx, [survivorId]);
};
