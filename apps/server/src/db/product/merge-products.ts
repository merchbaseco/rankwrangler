import { type SQL, sql } from 'drizzle-orm';
import type { db } from '@/db/index';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Moves everything that hangs off one Product onto another and deletes the first. Used when two
 * stored rows turn out to be the same variation family. Rows the survivor already has (the same
 * keyword, search run, facet or history series) keep the survivor's copy; listing fields the
 * survivor lacks are filled from the other row.
 */
export const mergeProducts = async (
    transaction: Transaction,
    { survivorId, otherId }: { survivorId: string; otherId: string }
) => {
    if (survivorId === otherId) return;
    const survivor = sql`${survivorId}::uuid`;
    const other = sql`${otherId}::uuid`;
    for (const [table, key] of keyedTables) {
        await moveUnlessPresent(transaction, table, key, survivor, other);
    }
    await transaction.execute(
        sql`update product_history_imports set product_id=${survivor} where product_id=${other}`
    );
    await transaction.execute(
        sql`update discovery_evidence set product_id=${survivor} where product_id=${other}`
    );
    await transaction.execute(
        sql`update product_asin_aliases set product_id=${survivor} where product_id=${other}`
    );
    await transaction.execute(sql`
        update discovery_targets t set head_product_ids=(
            select coalesce(jsonb_agg(v order by o), '[]'::jsonb) from (
                select v, min(o) o from (
                    select case when e=${otherId} then ${survivorId} else e end v, o
                    from jsonb_array_elements_text(t.head_product_ids) with ordinality x(e, o)
                ) replaced group by v
            ) deduped
        )
        where t.head_product_ids ? ${otherId}`);
    await moveAsinKeyed(transaction, 'product_short_names', survivor, other);
    await moveAsinKeyed(transaction, 'product_cutout_thumbnails', survivor, other);
    for (const queue of ['product_ingest_queue', 'keepa_history_refresh_queue']) {
        await transaction.execute(sql`
            delete from ${sql.identifier(queue)} q using products p
            where p.id=${other} and q.marketplace_id=p.marketplace_id and q.asin=p.asin`);
    }
    await transaction.execute(sql`
        update products s set
            is_merch_listing=case when s.is_merch_listing or o.is_merch_listing then true
                else coalesce(s.is_merch_listing, o.is_merch_listing) end,
            representative_asin=coalesce(s.representative_asin, o.representative_asin),
            date_first_available=least(s.date_first_available, o.date_first_available),
            created_at=least(s.created_at, o.created_at),
            title=coalesce(s.title, o.title), brand=coalesce(s.brand, o.brand),
            thumbnail_url=coalesce(s.thumbnail_url, o.thumbnail_url),
            bullet_1=coalesce(s.bullet_1, o.bullet_1), bullet_2=coalesce(s.bullet_2, o.bullet_2),
            root_category_id=coalesce(s.root_category_id, o.root_category_id),
            root_category_bsr=coalesce(s.root_category_bsr, o.root_category_bsr),
            ${keepaColumns}
            history_admission_state=case when s.history_admission_state='notAdmitted'
                then o.history_admission_state else s.history_admission_state end,
            history_admission_reason=case when s.history_admission_state='notAdmitted'
                then o.history_admission_reason else s.history_admission_reason end,
            history_admitted_at=case when s.history_admission_state='notAdmitted'
                then o.history_admitted_at else s.history_admitted_at end
        from products o where s.id=${survivor} and o.id=${other}`);
    await transaction.execute(sql`delete from products where id=${other}`);
};

// Tables unique on (key, product_id): move the other row's entries the survivor lacks, drop the rest.
const keyedTables: readonly [string, string][] = [
    ['product_facets', 'facet_value_id'],
    ['product_history_series', 'source, metric, category_id'],
    ['catalog_search_results', 'run_id'],
    ['brand_discovery_products', 'target_id'],
    ['keyword_products', 'query_id'],
];

const moveUnlessPresent = async (
    transaction: Transaction,
    table: string,
    key: string,
    survivor: SQL,
    other: SQL
) => {
    const name = sql.identifier(table);
    const columns = sql.raw(key);
    await transaction.execute(sql`
        update ${name} set product_id=${survivor}
        where product_id=${other}
            and (${columns}) not in (select ${columns} from ${name} where product_id=${survivor})`);
    await transaction.execute(sql`delete from ${name} where product_id=${other}`);
};

// Short names and cutouts are keyed by ASIN: keep the survivor's, else adopt the other's.
const moveAsinKeyed = async (transaction: Transaction, table: string, survivor: SQL, other: SQL) => {
    const name = sql.identifier(table);
    await transaction.execute(sql`
        delete from ${name} t using products o
        where o.id=${other} and t.marketplace_id=o.marketplace_id and t.asin=o.asin
            and exists (select 1 from ${name} k join products s on s.id=${survivor}
                and k.marketplace_id=s.marketplace_id and k.asin=s.asin)`);
    await transaction.execute(sql`
        update ${name} t set asin=s.asin from products o, products s
        where o.id=${other} and s.id=${survivor} and t.marketplace_id=o.marketplace_id
            and t.asin=o.asin`);
};

const keepaColumns = sql.raw(
    [
        'keepa_fetched_at',
        'keepa_source_updated_at',
        'keepa_first_tracked_at',
        'keepa_root_category_id',
        'keepa_current_bsr',
        'keepa_current_new_price',
        'keepa_monthly_sold',
        'keepa_bsr_average_30',
        'keepa_bsr_average_90',
        'keepa_sales_rank_drops_30',
        'keepa_sales_rank_drops_90',
        'keepa_sales_rank_drops_180',
        'keepa_sales_rank_drops_365',
        'sp_api_fetched_at',
        'sp_api_resolved_at',
        'variations_checked_at',
    ]
        .map(column => `${column}=coalesce(s.${column}, o.${column}),`)
        .join(' ')
);
