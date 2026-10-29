import { normalizeDiscoveryKeyword } from './discovery-candidate-policy';
import { extractKeywordPrefix, merchProductTermKind } from './keyword-prefix';

export const BRAND_ANALYTICS_MARKETPLACE_ID = 'ATVPDKIKX0DER';

// A clicked product counts as apparel when its title names a shirt-like garment. A search term is
// kept when at least one of its top-3 clicked products does: in the October eval this kept about
// 197k of 2.95M weekly terms and 83% of the owner's real clicked-search volume, while dropping
// terms such as "halloween makeup" or "christmas lights". Widening the titles to every Merch
// product type was measured on a real week and rejected: clicked mugs, cases and bags come from
// ordinary brands, so it admitted "diamond tester", "glp1", "iphone 16 case", "umbrella" and
// "storage bin". Other Merch product types arrive through prefixes instead (see keyword-prefix.ts).
export const APPAREL_TITLE_PATTERN =
    /\b(t-?shirts?|tees?|shirts?|hoodies?|sweatshirts?|tank tops?|raglans?|pullovers?|crewnecks?|v-necks?)\b/i;
export const MIN_APPAREL_CLICKS = 1;
const MAX_CLICKED_ASINS = 3;
const MAX_TERM_LENGTH = 200;

// Amazon publishes a Sunday–Saturday week a day or two after it ends. Requesting earlier returns a
// cancelled report, which the import retries later.
export const BRAND_ANALYTICS_PUBLISH_DELAY_DAYS = 2;

export type BrandAnalyticsTerm = {
    term: string;
    rank: number;
    clickedAsins: string[];
    apparelClicks: number;
    // The search text itself names a Merch product ("teacher blanket"). Such a term is kept even
    // without apparel clicks, and becomes a trial only once its prefix is a registered prefix.
    merchProductText: boolean;
    prefix: string | null;
};

export const normalizeBrandAnalyticsTerm = (value: string) =>
    normalizeDiscoveryKeyword(value).toLowerCase();

// The latest complete Sunday–Saturday week that Amazon has had time to publish, as UTC dates.
export const latestBrandAnalyticsWeek = (now: Date) => {
    const shifted = new Date(now.getTime() - BRAND_ANALYTICS_PUBLISH_DELAY_DAYS * dayMs);
    const midnight = Date.UTC(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        shifted.getUTCDate()
    );
    const weekEndExclusive = midnight - shifted.getUTCDay() * dayMs;
    return {
        weekStart: isoDate(weekEndExclusive - 7 * dayMs),
        weekEnd: isoDate(weekEndExclusive - dayMs),
    };
};

// Aggregates report rows (one per search term and clicked product) into one compact entry per
// kept search term: one with an apparel click, or whose text names a Merch product. Rows of one term arrive together, so only the current term's rows and the kept
// terms are held; a whole weekly report never sits in memory.
export const createBrandAnalyticsAccumulator = () => {
    const kept = new Map<string, Entry>();
    let group: Entry | null = null;
    let rows = 0;
    let terms = 0;
    const flush = () => {
        if (!group) return;
        terms += 1;
        const previous = kept.get(group.term);
        const merged = previous ? mergeEntries(previous, group) : group;
        if (apparelClicks(merged) >= MIN_APPAREL_CLICKS || merchProductTermKind(group.term))
            kept.set(group.term, merged);
        group = null;
    };
    return {
        add: (row: Record<string, unknown>) => {
            rows += 1;
            const parsed = parseRow(row);
            if (!parsed) return;
            if (group?.term !== parsed.term) flush();
            const current = group ?? { term: parsed.term, rank: parsed.rank, clicks: [] };
            group = current;
            current.rank = Math.min(current.rank, parsed.rank);
            if (parsed.click) current.clicks.push(parsed.click);
        },
        finish: () => {
            flush();
            return {
                rows,
                terms,
                kept: [...kept.values()].map(toTerm).sort((a, b) => a.rank - b.rank),
            };
        },
    };
};

type Click = { asin: string; order: number; apparel: boolean };
type Entry = { term: string; rank: number; clicks: Click[] };

const dayMs = 86_400_000;
const isoDate = (epochMs: number) => new Date(epochMs).toISOString().slice(0, 10);
const asinPattern = /^[A-Z0-9]{10}$/;

const parseRow = (row: Record<string, unknown>) => {
    if (typeof row.searchTerm !== 'string') return null;
    const term = normalizeBrandAnalyticsTerm(row.searchTerm);
    const rank = Number(row.searchFrequencyRank);
    if (!term || term.length > MAX_TERM_LENGTH || /^b0[a-z0-9]{8}$/u.test(term)) return null;
    if (!Number.isInteger(rank) || rank < 1) return null;
    const asin = typeof row.clickedAsin === 'string' ? row.clickedAsin.trim().toUpperCase() : '';
    const order = Number(row.clickShareRank);
    const title = typeof row.clickedItemName === 'string' ? row.clickedItemName : '';
    return {
        term,
        rank,
        click: asinPattern.test(asin)
            ? {
                  asin,
                  order: Number.isFinite(order) ? order : MAX_CLICKED_ASINS + 1,
                  apparel: APPAREL_TITLE_PATTERN.test(title),
              }
            : null,
    };
};

const mergeEntries = (a: Entry, b: Entry): Entry => ({
    term: a.term,
    rank: Math.min(a.rank, b.rank),
    clicks: [...a.clicks, ...b.clicks.filter(click => !a.clicks.some(c => c.asin === click.asin))],
});

const topClicks = (entry: Entry) =>
    [...entry.clicks].sort((a, b) => a.order - b.order).slice(0, MAX_CLICKED_ASINS);

const apparelClicks = (entry: Entry) => topClicks(entry).filter(click => click.apparel).length;

const toTerm = (entry: Entry): BrandAnalyticsTerm => ({
    term: entry.term,
    rank: entry.rank,
    clickedAsins: topClicks(entry).map(click => click.asin),
    apparelClicks: apparelClicks(entry),
    merchProductText: merchProductTermKind(entry.term) !== null,
    prefix: extractKeywordPrefix(entry.term),
});
