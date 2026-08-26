import {
    SEED_AUDIENCES,
    SEED_BRANDS,
    SEED_CATEGORIES,
    SEED_DESIGN_BULLETS,
    SEED_GARMENTS,
    SEED_SENTIMENTS,
} from '@/dev-seed/vocabulary';
import { DAY_MS, HOUR_MS, shiftMs } from '@/dev-seed/time-offsets';
import { mintSeedAsin } from '@/dev-seed/identity';
import type { BuilderContext, DevSeedPlan, PlanRows, SeedProduct } from '@/dev-seed/types';

/**
 * The canonical catalog the dashboard opens onto: Products, the facet values
 * that populate the filter sidebar, and the Keepa categories their ranks are
 * measured in.
 *
 * Every Product is refreshed inside the freshness window, deliberately. A stale
 * `keepa_fetched_at` would make the first dashboard read schedule real provider
 * work, and a seeded database must never reach for Keepa or SP-API.
 */

/**
 * Inside PRODUCT_DEFAULT_MAX_AGE_MS (48h) with margin, so no dashboard read
 * finds a stale Product and schedules provider work. The spread still straddles
 * 24 hours, which is where the catalog's "last updated" filter cuts, so that
 * filter partitions the catalog instead of matching all of it.
 */
const MAX_FETCH_AGE_MS = 44 * HOUR_MS;
const RECENT_FETCH_SHARE = 0.45;

const LISTING_STATUS_DELETED_RATE = 0.06;
const MERCH_KNOWN_RATE = 0.82;
const MERCH_UNKNOWN_RATE = 0.08;
/** Most Products carry a history series; the rest exercise the empty chart. */
const HISTORY_SHARE = 0.85;
const FACETS_READY_RATE = 0.86;
const FACETS_ERROR_RATE = 0.04;

export interface CatalogBuild {
    readonly products: DevSeedPlan['products'];
    readonly productFacetValues: DevSeedPlan['productFacetValues'];
    readonly productFacets: DevSeedPlan['productFacets'];
    readonly keepaCategories: DevSeedPlan['keepaCategories'];
    /** The same Products in the shape later builders consume. */
    readonly seedProducts: readonly SeedProduct[];
}

export const buildCatalog = (context: BuilderContext): CatalogBuild => {
    const { random, now, marketplaceId, mintId, options } = context;

    const keepaCategories = SEED_CATEGORIES.map(category => ({
        id: mintId('category'),
        marketplaceId,
        categoryId: category.id,
        name: category.name,
        createdAt: shiftMs(now, -60 * DAY_MS),
        updatedAt: shiftMs(now, -random.int(1, 20) * HOUR_MS),
    }));

    const facetValueIds = new Map<string, string>();
    const productFacetValues = SEED_AUDIENCES.map(audience => {
        const id = mintId('facetValue');
        facetValueIds.set(`${audience.facet}:${audience.name}`, id);
        return {
            id,
            facet: audience.facet,
            name: audience.name,
            createdAt: shiftMs(now, -random.int(3, 40) * DAY_MS),
        };
    });

    const products: PlanRows<'products'> = [];
    const productFacets: PlanRows<'productFacets'> = [];
    const seedProducts: SeedProduct[] = [];
    const historyTarget = Math.max(1, Math.round(options.productCount * HISTORY_SHARE));

    for (let index = 0; index < options.productCount; index += 1) {
        const id = mintId('product');
        const asin = mintSeedAsin(index + 1);
        const audience = random.pick(SEED_AUDIENCES);
        const secondaryAudience = random.pick(SEED_AUDIENCES);
        const title = buildTitle(context, audience.nouns);
        const category = random.pick(SEED_CATEGORIES);

        // Long-tailed: a few strong sellers, a wide shoulder, some rank-less.
        const demand = clamp(random.between(0.02, 1) ** 1.7, 0.01, 1);
        const isRanked = random.chance(0.92);
        const rootCategoryBsr = isRanked ? bsrForDemand(demand) : null;
        const isMerchListing = pickMerchListing(context);
        const listingStatus = random.chance(LISTING_STATUS_DELETED_RATE) ? 'deleted' : 'active';
        const currentNewPrice = random.int(1499, 3299);
        const keepaFetchedAt = pickFetchedAt(context);
        const spApiFetchedAt = pickFetchedAt(context);
        const createdAt = shiftMs(now, -random.between(0, options.dayCount * DAY_MS));
        const hasHistory = index < historyTarget;
        const facetsState = pickFacetsState(context, isMerchListing);

        products.push({
            id,
            marketplaceId,
            asin,
            title,
            brand: random.pick(SEED_BRANDS),
            isMerchListing,
            amazonListingStatus: listingStatus,
            // Only a Merch listing carries persisted seller bullets.
            bullet1: isMerchListing ? random.pick(SEED_DESIGN_BULLETS) : null,
            bullet2: isMerchListing && random.chance(0.6) ? random.pick(SEED_DESIGN_BULLETS) : null,
            thumbnailUrl: buildThumbnailDataUri(context, title),
            dateFirstAvailable: shiftMs(now, -random.int(20, 900) * DAY_MS),
            rootCategoryId: category.id,
            rootCategoryBsr,
            facetsState,
            facetsUpdatedAt:
                facetsState === 'pending' ? null : shiftMs(now, -random.int(1, 72) * HOUR_MS),
            spApiFetchedAt,
            spApiResolvedAt: shiftMs(spApiFetchedAt, -random.int(0, 90) * 1000),
            keepaFetchedAt,
            keepaSourceUpdatedAt: shiftMs(keepaFetchedAt, -random.int(10, 400) * 60 * 1000),
            keepaFirstTrackedAt: shiftMs(now, -random.int(30, 720) * DAY_MS),
            keepaRootCategoryId: category.id,
            keepaCurrentBsr: rootCategoryBsr,
            keepaCurrentNewPrice: currentNewPrice,
            keepaMonthlySold: monthlySoldForDemand(context, demand),
            keepaBsrAverage30:
                rootCategoryBsr === null ? null : jitterRank(context, rootCategoryBsr, 0.18),
            keepaBsrAverage90:
                rootCategoryBsr === null ? null : jitterRank(context, rootCategoryBsr, 0.32),
            keepaSalesRankDrops30: dropsForDemand(context, demand, 30),
            keepaSalesRankDrops90: dropsForDemand(context, demand, 90),
            keepaSalesRankDrops180: dropsForDemand(context, demand, 180),
            keepaSalesRankDrops365: dropsForDemand(context, demand, 365),
            createdAt,
        });

        if (facetsState === 'ready') {
            const attached = new Set([`${audience.facet}:${audience.name}`]);
            if (random.chance(0.45)) {
                attached.add(`${secondaryAudience.facet}:${secondaryAudience.name}`);
            }
            for (const key of attached) {
                const facetValueId = facetValueIds.get(key);
                if (!facetValueId) {
                    continue;
                }
                productFacets.push({
                    productId: id,
                    facetValueId,
                    createdAt: shiftMs(now, -random.int(1, 72) * HOUR_MS),
                });
            }
        }

        seedProducts.push({
            id,
            asin,
            title,
            rootCategoryId: category.id,
            rootCategoryBsr,
            currentNewPrice,
            keepaFetchedAt,
            demand,
            hasHistory,
        });
    }

    return { keepaCategories, productFacetValues, productFacets, products, seedProducts };
};

/** "Funny Cat Mom Vintage Retro T-Shirt" — the shape Merch titles actually take. */
const buildTitle = (context: BuilderContext, nouns: readonly string[]) => {
    const { random } = context;
    const lead = random.chance(0.55) ? `${random.pick(SEED_SENTIMENTS)} ` : '';
    const trail = random.chance(0.35) ? ` ${random.pick(SEED_SENTIMENTS)}` : '';
    return `${lead}${random.pick(nouns)}${trail} ${random.pick(SEED_GARMENTS)}`.replace(
        /\s+/gu,
        ' '
    );
};

/**
 * A tiny inline SVG rather than an Amazon image URL: the catalog grid renders
 * a real thumbnail, and a seeded dashboard makes no outbound image request.
 */
const buildThumbnailDataUri = (context: BuilderContext, title: string) => {
    const hue = context.random.int(0, 359);
    const initials = title
        .split(' ')
        .filter(word => /^[A-Za-z]/u.test(word))
        .slice(0, 2)
        .map(word => word[0]?.toUpperCase() ?? '')
        .join('');
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">` +
        `<rect width="160" height="160" fill="hsl(${hue} 42% 88%)"/>` +
        `<path d="M40 44h80l14 22-22 12v50H48V78L26 66z" fill="hsl(${hue} 46% 62%)"/>` +
        `<text x="80" y="112" font-family="sans-serif" font-size="30" font-weight="700" ` +
        `fill="hsl(${hue} 55% 24%)" text-anchor="middle">${initials}</text></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
};

/** Straddles the 24-hour filter boundary while staying inside the freshness window. */
const pickFetchedAt = (context: BuilderContext) => {
    const { now, random } = context;
    return random.chance(RECENT_FETCH_SHARE)
        ? shiftMs(now, -random.between(0, 23 * HOUR_MS))
        : shiftMs(now, -random.between(25 * HOUR_MS, MAX_FETCH_AGE_MS));
};

const pickMerchListing = (context: BuilderContext) => {
    const roll = context.random.next();
    if (roll < MERCH_UNKNOWN_RATE) {
        // Bullets were unavailable, so Merch-listing knowledge stays unknown.
        return null;
    }
    return roll < MERCH_UNKNOWN_RATE + MERCH_KNOWN_RATE;
};

const pickFacetsState = (context: BuilderContext, isMerchListing: boolean | null) => {
    if (isMerchListing !== true) {
        return 'pending';
    }
    const roll = context.random.next();
    if (roll < FACETS_ERROR_RATE) {
        return 'error';
    }
    return roll < FACETS_ERROR_RATE + FACETS_READY_RATE ? 'ready' : 'pending';
};

/** Demand 1 lands near rank 900; demand 0.05 lands deep in the six figures. */
const bsrForDemand = (demand: number) => Math.round(900 + (1 - demand) ** 3 * 2_400_000);

const monthlySoldForDemand = (context: BuilderContext, demand: number) => {
    if (demand < 0.25) {
        // Keepa reports no monthly-sold figure for slow movers.
        return null;
    }
    return Math.max(50, Math.round(demand ** 2 * 4000 + context.random.between(-40, 60)));
};

const dropsForDemand = (context: BuilderContext, demand: number, days: number) =>
    Math.max(0, Math.round(demand * days * context.random.between(0.4, 1.4)));

const jitterRank = (context: BuilderContext, rank: number, spread: number) =>
    Math.max(1, Math.round(rank * (1 + context.random.normal() * spread)));

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
