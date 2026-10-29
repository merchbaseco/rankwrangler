import { type SQL, sql } from 'drizzle-orm';
import {
    type KeywordDirectoryFacetsInput,
    type keywordDirectoryHeats,
    keywordFreshness,
    keywordStages,
} from '@/api/keyword-directory-input';
import { KEYWORD_HOT_SCORE, KEYWORD_WARM_SCORE } from '@/services/keyword-standing-policy';
import { db } from './index';
import { directoryFilters, directoryWhere } from './keyword-directory-filters';
import { directorySource } from './keyword-directory-source';

const SCORE_BUCKETS = 20;
const SCORE_BUCKET_WIDTH = 100 / SCORE_BUCKETS;

/**
 * The Keywords sidebar counts and KPI band in one aggregate over the directory source. Each
 * sidebar group is counted under every other filter but not its own (faceted exclusion); `total`,
 * the score histogram, `minedLast24h` and `medianShelfBsr` see all filters. `needsSync` and
 * `syncing` are the freshness counts, so the band keeps showing the queue under a freshness
 * filter. `minedLast24h` counts keywords whose latest page check is under a day old.
 */
export const readKeywordDirectoryFacets = async (
    input: KeywordDirectoryFacetsInput,
    asOf = new Date().toISOString()
) => {
    const filters = directoryFilters(input);
    const all = directoryWhere(filters);
    const without = (group: keyof typeof filters) => directoryWhere(filters, [group]);
    const count = (name: string, condition: SQL) =>
        sql`count(*) filter (where ${condition})::int ${sql.identifier(name)}`;
    const [row] = await db.execute<Record<string, number | null>>(sql`
        ${directorySource({
            asOf,
            sort: 'work',
            search: input.search,
            facet: input.facet,
            shelf: true,
        })}
        select ${count('total', all)},
            ${count('heat_hot', sql`${without('heat')} and heat='hot'`)},
            ${count('heat_warm', sql`${without('heat')} and heat='warm'`)},
            ${count('heat_cold', sql`${without('heat')} and heat='cold'`)},
            ${sql.join(
                keywordStages.map(stage =>
                    count(`stage_${stage}`, sql`${without('stage')} and stage=${stage}`)
                ),
                sql`, `
            )},
            ${sql.join(
                keywordFreshness.map(freshness =>
                    count(
                        `freshness_${freshness}`,
                        sql`${without('freshness')} and freshness=${freshness}`
                    )
                ),
                sql`, `
            )},
            ${count('shelf_has_elite', sql`${without('shelfElite')} and elite>0`)},
            ${count('shelf_no_elite', sql`${without('shelfElite')} and elite=0`)},
            ${count('merch_tracked', sql`${without('merch')} and merch>0`)},
            ${count('merch_none', sql`${without('merch')} and merch=0`)},
            ${sql.join(
                Array.from({ length: SCORE_BUCKETS }, (_, index) => {
                    const low = index * SCORE_BUCKET_WIDTH;
                    const last = index === SCORE_BUCKETS - 1;
                    return count(
                        `score_${index}`,
                        sql`${all} and score>=${sql.raw(String(low))} and score${sql.raw(last ? '<=' : '<')}${sql.raw(String(low + SCORE_BUCKET_WIDTH))}`
                    );
                }),
                sql`, `
            )},
            ${count('mined_last_24h', sql`${all} and "lastCheckedAt">=${asOf}::timestamp-interval '24 hours'`)},
            round(percentile_cont(0.5) within group (order by median_bsr)
                filter (where ${all} and median_bsr is not null))::int median_shelf_bsr
        from ordered`);
    const value = (name: string) => Number(row?.[name] ?? 0);
    return {
        total: value('total'),
        heat: { hot: value('heat_hot'), warm: value('heat_warm'), cold: value('heat_cold') },
        stage: byName(keywordStages, stage => value(`stage_${stage}`)),
        freshness: byName(keywordFreshness, freshness => value(`freshness_${freshness}`)),
        shelf: { hasElite: value('shelf_has_elite'), noElite: value('shelf_no_elite') },
        merch: { tracked: value('merch_tracked'), none: value('merch_none') },
        scoreHistogram: Array.from({ length: SCORE_BUCKETS }, (_, index) => ({
            bucketMax: (index + 1) * SCORE_BUCKET_WIDTH,
            count: value(`score_${index}`),
            heat: scoreHeat(index * SCORE_BUCKET_WIDTH),
        })),
        minedLast24h: value('mined_last_24h'),
        medianShelfBsr: row?.median_shelf_bsr ?? null,
        needsSync: value('freshness_needsSync'),
        syncing: value('freshness_syncing'),
    };
};

/** A bucket's heat is the tier its lower bound scores into; buckets never straddle a threshold. */
const scoreHeat = (low: number): (typeof keywordDirectoryHeats)[number] =>
    low >= KEYWORD_HOT_SCORE ? 'hot' : low >= KEYWORD_WARM_SCORE ? 'warm' : 'cold';

const byName = <const Name extends string>(names: readonly Name[], read: (name: Name) => number) =>
    Object.fromEntries(names.map(name => [name, read(name)])) as Record<Name, number>;
