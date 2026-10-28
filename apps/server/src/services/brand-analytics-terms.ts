import { normalizeDiscoveryKeyword } from './discovery-candidate-policy';

export const BRAND_ANALYTICS_MARKETPLACE_ID = 'ATVPDKIKX0DER';

// A clicked product counts when its title names a product type Merch on Demand sells: shirts and
// other apparel, hats, bags, phone accessories, home goods, drinkware and stationery. A search term
// is kept only when at least one of its top-3 clicked products does. The apparel-only version of
// this filter kept about 197k of 2.95M weekly terms and 83% of the owner's real clicked-search
// volume; widening it to every Merch product type admits mug, tote and PopSockets searches while
// still dropping terms such as "halloween makeup" or "christmas lights". The stored count keeps its
// original `apparelClicks` name.
export const MERCH_PRODUCT_TITLE_PATTERN = new RegExp(
    `\\b(?:${[
        't-?shirts?',
        'tees?',
        'shirts?',
        'tops',
        '(?:tank|crop) top',
        'raglans?',
        'jerseys?',
        'sweatshirts?',
        'hoodies?',
        'pullovers?',
        'crewnecks?',
        'v-necks?',
        'polos?',
        'quarter[- ]zips?',
        '1/4 zips?',
        'jackets?',
        'hats?',
        '(?:baseball|trucker|dad|snapback) caps?',
        'visors?',
        'backpacks?',
        'pop ?sockets?',
        'pop ?grips?',
        '(?:i?phone|galaxy)\\b.{0,40}?\\bcases?',
        'totes?',
        'cross-?body(?: bags?)?',
        'laptop sleeves?',
        'mouse ?pads?',
        'pillows?',
        'blankets?',
        'posters?',
        'tumblers?',
        'mugs?',
        'water bottles?',
        'journals?',
        'notebooks?',
        'pens?',
    ].join('|')})\\b`,
    'i'
);
export const MIN_MERCH_PRODUCT_CLICKS = 1;
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
// kept search term. Rows of one term arrive together, so only the current term's rows and the kept
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
        if (apparelClicks(merged) >= MIN_MERCH_PRODUCT_CLICKS) kept.set(group.term, merged);
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

type Click = { asin: string; order: number; merchProduct: boolean };
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
                  merchProduct: MERCH_PRODUCT_TITLE_PATTERN.test(title),
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

const apparelClicks = (entry: Entry) => topClicks(entry).filter(click => click.merchProduct).length;

const toTerm = (entry: Entry): BrandAnalyticsTerm => ({
    term: entry.term,
    rank: entry.rank,
    clickedAsins: topClicks(entry).map(click => click.asin),
    apparelClicks: apparelClicks(entry),
});
