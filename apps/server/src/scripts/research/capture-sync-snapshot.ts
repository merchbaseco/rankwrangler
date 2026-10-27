import postgres from 'postgres';
const env = process.env;
const db = postgres({
    host: env.RANKWRANGLER_DATABASE_HOST,
    port: Number(env.RANKWRANGLER_DATABASE_DIRECT_PORT || env.RANKWRANGLER_DATABASE_PORT),
    database: env.RANKWRANGLER_DATABASE_NAME,
    username: env.RANKWRANGLER_DATABASE_USER,
    password: env.RANKWRANGLER_DATABASE_PASSWORD,
    ssl: env.RANKWRANGLER_DATABASE_SSL_MODE === 'verify-full' ? 'verify-full' : false,
    prepare: false,
    max: 1,
    connection: { default_transaction_read_only: true, statement_timeout: 10000 },
});
try {
    const products =
        await db`select count(*)::int total,count(*) filter(where marketplace_id='ATVPDKIKX0DER')::int us,count(*) filter(where marketplace_id='ATVPDKIKX0DER' and is_merch_listing and amazon_listing_status='active')::int active_us_merch,count(*) filter(where history_admission_state='admitted')::int history_admitted from products`;
    const bands =
        await db`with p as(select *,case when root_category_bsr<100000 then 'under100k' when root_category_bsr<300000 then '100kTo300k' when root_category_bsr<1000000 then '300kTo1m' when root_category_bsr is null then 'missing' else 'over1m' end band,exists(select 1 from official_brands b where b.marketplace_id=products.marketplace_id and b.normalized_brand=lower(btrim(regexp_replace(products.brand,'[[:space:]]+',' ','g')))) official from products where marketplace_id='ATVPDKIKX0DER' and is_merch_listing and amazon_listing_status='active')select band,official,count(*)::int products,count(*) filter(where not exists(select 1 from product_keyword_mining m where m.product_id=p.id and m.stage='complete'))::int unmined from p group by band,official order by band,official`;
    const keywords =
        await db`select tracking,standing_tier,enabled,count(*)::int keywords,count(*) filter(where head_observed_at is null)::int never_observed,count(*) filter(where next_check_at is null or next_check_at<now())::int due,avg(interval_days) interval_days from discovery_targets where kind='keyword' group by tracking,standing_tier,enabled`;
    const registry =
        await db`select display_brand from official_brands order by display_brand limit 100`;
    const topBrands =
        await db`select brand,count(*)::int products,min(root_category_bsr) best_rank from products where marketplace_id='ATVPDKIKX0DER' and is_merch_listing and amazon_listing_status='active' group by brand order by count(*) desc limit 15`;
    const eligibleSamples =
        await db`with p as(select asin,title,brand,root_category_bsr,date_first_available,case when root_category_bsr<100000 then 'under100k' when root_category_bsr<300000 then '100kTo300k' when root_category_bsr<1000000 then '300kTo1m' when root_category_bsr is null then 'missing' else 'over1m' end band,exists(select 1 from official_brands b where b.marketplace_id=products.marketplace_id and b.normalized_brand=lower(btrim(regexp_replace(products.brand,'[[:space:]]+',' ','g')))) official from products where marketplace_id='ATVPDKIKX0DER' and is_merch_listing and amazon_listing_status='active'),ranked as(select *,row_number()over(partition by band,official order by md5(asin)) sample_number from p) select * from ranked where sample_number<=4 order by band,official,sample_number limit 40`;
    const asinSet =
        await db`select asin,is_merch_listing,amazon_listing_status from products where marketplace_id='ATVPDKIKX0DER' order by asin limit 100000`;
    const keywordSet =
        await db`select q.normalized_term,t.tracking,t.standing_tier,t.popularity_score,t.interval_days,t.next_check_at,t.head_observed_at,jsonb_array_length(t.head_product_ids) head_count from catalog_queries q join discovery_targets t on t.query_id=q.id where t.kind='keyword' and t.enabled order by q.normalized_term limit 10000`;
    const candidates =
        await db`select term,verdict,probability from mined_keyword_candidates order by term limit 10000`;
    const passes =
        await db`select q.normalized_term,p.stop_reason,p.contiguous_pages,p.low_yield_pages,p.oldest_page_at,p.last_page_at,p.created_at,p.updated_at from keyword_exploration_passes p join discovery_targets t on t.id=p.target_id join catalog_queries q on q.id=t.query_id order by p.created_at desc limit 100`;
    const capacity = await db`select * from spapi_catalog_capacity where id=1`;
    const keepa = await db`select * from keepa_capacity_state where id=1`;
    const mining =
        await db`select stage,count(*)::int products from product_keyword_mining group by stage`;
    const auto =
        await db`select stage,count(*)::int keywords,sum(jsonb_array_length(coalesce(suggestions,'[]'::jsonb)))::int suggestions from keyword_autocomplete group by stage`;
    const telemetry =
        await db`select provider,operation,count(*)::int requests,count(*) filter(where is_error)::int errors,percentile_cont(.5)within group(order by latency_ms) median_ms,percentile_cont(.9)within group(order by latency_ms) p90_ms from provider_attempts where attempted_at>now()-interval '7 days' group by provider,operation`;
    const jobs =
        await db`select job_name,status,count(*)::int executions,percentile_cont(.5)within group(order by extract(epoch from(finished_at-started_at))) median_seconds,percentile_cont(.9)within group(order by extract(epoch from(finished_at-started_at))) p90_seconds from job_executions where started_at>now()-interval '7 days' group by job_name,status`;
    const membership =
        await db`select count(*)::int memberships,count(distinct query_id)::int keywords,count(distinct product_id)::int products from keyword_products`;
    const storage =
        await db`select relname,pg_total_relation_size(c.oid)::bigint bytes,c.reltuples::bigint estimated_rows from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by pg_total_relation_size(c.oid) desc limit 12`;
    const status = await db`select now() observed_at,paused from automatic_sync_control where id=1`;

    const refresh =
        await db`select case when root_category_bsr is null then 'missing' when root_category_bsr<200000 then 'under200k' when root_category_bsr<500000 then '200kTo500k' when root_category_bsr<1000000 then '500kTo1m' when root_category_bsr<3000000 then '1mTo3m' else 'over3m' end band,count(*)::int products,count(*) filter(where is_merch_listing)::int merch from products where amazon_listing_status='active' group by band order by band`;
    const history =
        await db`select case when root_category_bsr<300000 then 'daily' when root_category_bsr<1000000 then 'weekly' else 'notAutomatic' end band,count(*)::int products from products where is_merch_listing and amazon_listing_status='active' and history_admission_state='admitted' group by band`;
    const sizes =
        await db`select relname,pg_total_relation_size(c.oid)::bigint bytes,c.reltuples::bigint estimated_rows from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and relname in ('products','catalog_queries','discovery_targets','mined_keyword_candidates','product_keyword_mining','product_keyword_candidates','keyword_autocomplete','keyword_autocomplete_candidates','keyword_products','catalog_search_runs','catalog_search_results') order by relname`;
    const recent =
        await db`select job_name,status,started_at,finished_at from job_executions where job_name='process-keyword-sync' order by started_at desc limit 5`;
    const calls =
        await db`select provider,operation,attempted_at,latency_ms from provider_attempts where provider in ('typesafe','amazonAds','amazonAutocomplete') and operation in ('typesafe.keyword.judge','ads.keyword.recommendations','amazon.autocomplete') order by attempted_at desc limit 10`;

    console.log(
        JSON.stringify({
            extra: { refresh, history, sizes, recent, calls },
            status,
            products,
            bands,
            registry,
            topBrands,
            eligibleSamples,
            asinSet,
            keywordSet,
            keywords,
            candidates,
            passes,
            capacity,
            keepa,
            mining,
            auto,
            telemetry,
            jobs,
            membership,
            storage,
        })
    );
} finally {
    await db.end();
}
