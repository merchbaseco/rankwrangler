import { mintSeedAsin } from '@/dev-seed/identity';
import { drawSeedDemand, dropsForRank, monthlySoldForRank } from '@/dev-seed/seed-demand';
import { buildThumbnailDataUri } from '@/dev-seed/seed-thumbnail';
import { DAY_MS, HOUR_MS, shiftMs } from '@/dev-seed/time-offsets';
import type { BuilderContext, DevSeedPlan, PlanRows, SeedProduct } from '@/dev-seed/types';
import {
    SEED_AUDIENCES,
    SEED_BRANDS,
    SEED_CATEGORIES,
    SEED_DESIGN_BULLETS,
    SEED_GARMENTS,
    SEED_MERCH_SEARCH_TERMS,
    SEED_SENTIMENTS,
    type SeedAudience,
    seedAudienceForTerm,
} from '@/dev-seed/vocabulary';

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

/** Delisting only touches non-Merch rows, so every Merch count agrees with Explore. */
const LISTING_STATUS_DELETED_RATE = 0.4;
/** Most designs belong to a niche the seed also searches, so shelves fill from the niche. */
const FEATURED_AUDIENCE_SHARE = 0.8;
const MERCH_KNOWN_RATE = 0.82;
const MERCH_UNKNOWN_RATE = 0.08;
/** Products off the Explore table (non-Merch, delisted, unranked) that still carry history. */
const OFF_TABLE_HISTORY_SHARE = 0.5;
const FACETS_READY_RATE = 0.86;
const FACETS_ERROR_RATE = 0.04;
/**
 * Every third Product was first available inside Explore's 60-day window, so its published band
 * has a shape. Chosen by position, not a draw, so the rest of the seeded stream stays put.
 */
const RECENT_LAUNCH_EVERY = 3;

export interface CatalogBuild {
    readonly products: DevSeedPlan['products'];
    readonly productFacetValues: DevSeedPlan['productFacetValues'];
    readonly productFacets: DevSeedPlan['productFacets'];
    readonly keepaCategories: DevSeedPlan['keepaCategories'];
    /** The same Products in the shape later builders consume. */
    readonly seedProducts: readonly SeedProduct[];
    /** The search terms Search mines, one per featured niche. */
    readonly featuredTerms: readonly string[];
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
    const featuredTerms = random.shuffle(SEED_MERCH_SEARCH_TERMS).slice(0, options.queryCount);
    const featured = featuredTerms
        .map(seedAudienceForTerm)
        .filter((audience): audience is SeedAudience => audience !== null);
    const pickAudience = () =>
        featured.length > 0 && random.chance(FEATURED_AUDIENCE_SHARE)
            ? random.pick(featured)
            : random.pick(SEED_AUDIENCES);

    for (let index = 0; index < options.productCount; index += 1) {
        const id = mintId('product');
        const asin = mintSeedAsin(index + 1);
        const audience = pickAudience();
        // The secondary niche ranges the whole vocabulary, so every facet stays live.
        const secondaryAudience = random.pick(SEED_AUDIENCES);
        const title = buildTitle(context, audience.nouns);
        const category = random.pick(SEED_CATEGORIES);

        const isMerchListing = pickMerchListing(context);
        // Every Merch design on the table is ranked and listed; the rank-less
        // and delisted rows sit off it, where the empty states still need them.
        const onTable = isMerchListing === true;
        const { demand, rank: rootCategoryBsr } = drawSeedDemand(
            context,
            onTable || random.chance(0.5)
        );
        const listingStatus =
            !onTable && random.chance(LISTING_STATUS_DELETED_RATE) ? 'deleted' : 'active';
        const currentNewPrice = random.int(1499, 3299);
        const keepaFetchedAt = pickFetchedAt(context);
        const spApiFetchedAt = pickFetchedAt(context);
        const createdAt = shiftMs(now, -random.between(0, options.dayCount * DAY_MS));
        // Every card carries a 30-day sparkline; off-table rows exercise the empty chart.
        const hasHistory = onTable || random.chance(OFF_TABLE_HISTORY_SHARE);
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
            dateFirstAvailable: shiftMs(
                now,
                -(index % RECENT_LAUNCH_EVERY === 0 ? random.int(0, 59) : random.int(60, 900)) *
                    DAY_MS
            ),
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
            keepaMonthlySold: monthlySoldForRank(context, rootCategoryBsr),
            keepaBsrAverage30:
                rootCategoryBsr === null ? null : jitterRank(context, rootCategoryBsr, 0.18),
            keepaBsrAverage90:
                rootCategoryBsr === null ? null : jitterRank(context, rootCategoryBsr, 0.32),
            keepaSalesRankDrops30: dropsForRank(context, rootCategoryBsr, 30),
            keepaSalesRankDrops90: dropsForRank(context, rootCategoryBsr, 90),
            keepaSalesRankDrops180: dropsForRank(context, rootCategoryBsr, 180),
            keepaSalesRankDrops365: dropsForRank(context, rootCategoryBsr, 365),
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
            audiences: [audience.name, secondaryAudience.name],
        });
    }

    return {
        featuredTerms,
        keepaCategories,
        productFacetValues,
        productFacets,
        products,
        seedProducts,
    };
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

const jitterRank = (context: BuilderContext, rank: number, spread: number) =>
    Math.max(1, Math.round(rank * (1 + context.random.normal() * spread)));
